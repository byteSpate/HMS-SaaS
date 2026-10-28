# K — Docker design

| Control | Value |
| --- | --- |
| Document | K Docker design (images, Compose layouts, runtime hardening, secrets, environment, versioning, migrations) |
| Version | 0.4.0-draft |
| Status | **PROPOSED.** Docker is part of the supplied foundation. **The template files were not built or executed.** The running staging uses its own Dockerfiles and `compose.yaml` kept on the server, not these templates (see [DEPLOYMENT.md](../../DEPLOYMENT.md)). The Compose files were only parsed as YAML. Placeholders appear as `<<…>>`. |
| Owner role | DevOps lead; integrator (build scripts) |
| Updated | 2026-10-14 |
| Amended by | [ADR-019](D2-adr/ADR-019-supabase-postgres.md) (no database container: PostgreSQL 17 on Supabase), [ADR-020](D2-adr/ADR-020-valkey-nginx-droplet.md) (Valkey; nginx runs on the host, not as a container), [ADR-021](D2-adr/ADR-021-separate-web-api-origins.md) (separate web and API hostnames; no server-side API calls with the user's cookie). §1, §2, §4–§7 and §9 are updated to match. |
| Templates | [`templates/docker/`](../templates/docker/) — `Dockerfile.nest`, `Dockerfile.web`, `Dockerfile.migrate`, `Dockerfile.postgres`, `compose.prod.yaml`, `compose.dev.yaml`, `env.example`, `redis.conf`, `initdb-10-roles.sh`; [`templates/caddy/Caddyfile`](../templates/caddy/Caddyfile) (not used: host nginx instead, ADR-020) |

## 1. Goals

1. **Separate images per concern:** `web`, `api`, `worker`, `migrate`. Optionally a separate `pdf-renderer` image, maintained upstream. (No `postgres` image while the database is on Supabase, ADR-019.)
2. **Reproducible builds** from the monorepo with `turbo prune --docker` and the frozen lockfile.
3. **The same image digest** in staging and production.
4. **Minimal, non-root runtime** with health checks and graceful shutdown.
5. **No secrets in images or build logs.** Secrets are runtime files.

## 2. Image catalogue

| Image | Source | Contents | Runs as | Ports | Health |
| --- | --- | --- | --- | --- | --- |
| `hms-web` | `Dockerfile.web` | Next.js standalone server + static assets + self-hosted fonts | `node` (uid 1000) | 3100 | `GET /api/health` |
| `hms-api` | `Dockerfile.nest` (`APP=api`) | Compiled NestJS API + production deps (`pnpm deploy --prod`) + generated Prisma client | `node` | 4100 | `GET /health/live`, `/health/ready` (root paths, outside `/api/v1`) |
| `hms-worker` | `Dockerfile.nest` (`APP=worker`) | Compiled NestJS standalone worker | `node` | 9464 (health/metrics) | `GET /health` (heartbeat) |
| `hms-migrate` | `Dockerfile.migrate` | Prisma CLI (pinned 7.10.x), migrations incl. SQL, `migrate.sh`, `psql` client | `node` | — | one-off; exit code |
| `hms-postgres` | `Dockerfile.postgres` | **Not used while the database is on Supabase (ADR-019).** Kept for a future self-hosted option: official `postgres` + pgBackRest | `postgres` | 5432 (internal only) | `pg_isready` |
| pdf-renderer | upstream image pinned by digest | Headless Chromium HTML→PDF service | image default (non-root if supported) | 3000 (internal) | service health endpoint |
| Valkey | `valkey/valkey:9`, pinned by digest | — | image default | 6379, internal network only | `valkey-cli ping` |
| nginx | **Not an image:** the host's nginx service (ADR-020), shared with the ecommerce app | — | — | 80/443 on the host | `nginx -t`, systemd status |

## 3. Multi-stage build for the monorepo

Pattern, following the Turborepo Docker guide (D1 V-20):

```text
base     → node:24-bookworm-slim@sha256:<digest>, corepack enable (pnpm from "packageManager")
pruner   → turbo prune @hms/<app> --docker   → out/json (package.json files + pruned lockfile), out/full (sources)
deps     → copy out/json, pnpm install --frozen-lockfile  (cached unless dependencies change)
build    → copy out/full, turbo run build --filter=@hms/<app>...  (Prisma generate runs in @hms/database build)
           pnpm --filter @hms/<app> deploy --prod /out/app       (Nest apps)
runner   → fresh slim base, tini, copy only runtime files, USER node, HEALTHCHECK, CMD node …
```

**Why this fits:**
- Pruning means a change in `mod-lab` does not invalidate the web image's dependency layer.
- The frozen lockfile ensures the image contains exactly the reviewed versions (D1 §4).

**Notes:**
- **Base image:** Debian slim (glibc) rather than Alpine (musl). Native modules such as `argon2` and the Prisma tooling behave consistently on glibc. Pin by digest. Rebuild when a security update lands.
- **Prisma 7** generates the client to an explicit output path inside `packages/database`. The build stage must run generation before the app build. The runtime needs the generated client and `@prisma/adapter-pg` / `pg`, but not the Prisma CLI (except in `hms-migrate`).
- **`pnpm deploy`** flags differ across pnpm majors (e.g., workspace package injection). Confirm them in T-FND-05 for the pnpm version chosen in T-FND-01.
- **Remote Turborepo cache** may be used in CI builds by passing `TURBO_TEAM` and `TURBO_TOKEN` as build arguments to the build step only. They must not persist into the runtime layer ([L §6](L-cicd-sonarqube.md#6-turborepo-caching-policy)).
- **Next.js standalone** in a monorepo needs `outputFileTracingRoot` pointing at the repo root. The server file is then at `apps/web/server.js` inside the standalone folder. `public/` and `.next/static` are copied explicitly (Next.js docs).
- **Build cache mounts** (`--mount=type=cache`) speed pnpm installs without bloating layers.
- **Fonts** (Noto Sans Bengali/Noto Sans) are bundled in `packages/ui` and served by Next.js. The pdf-renderer gets the same fonts through the HTML (data URLs, or fonts installed in a derived image). Decide in T-PRN-01.

## 4. Separate API, web and worker concerns

| Concern | Decision |
| --- | --- |
| Scaling | `api` replicas scale independently (2 at T0). `worker` usually stays at 1 replica with per-queue concurrency, scaled only when queue metrics require it. BullMQ coordinates multiple workers safely, and the outbox relay uses `SKIP LOCKED`. |
| Failure isolation | A PDF/Chromium memory spike affects only `pdf-renderer` (memory-limited, internal network). Heavy reports run in `worker`, not `api`. |
| Deploy order | `migrate` → `api` → `worker` → `web` (J §9.1). `web` depends only on the API contract version it was built with. Contract changes are backward compatible within a release (H §7). |
| Networking | `egress` (web/api/worker/migrate → Supabase, object storage, partners), `backend` (internal, no internet: api/worker ↔ Valkey), `render` (internal: worker ↔ pdf-renderer). **web and api publish ports on `127.0.0.1` only**, so the host nginx can reach them and nothing else can; Valkey publishes nothing. |
| Privileges | `read_only: true` root filesystem with `tmpfs: /tmp` for web/api/worker (web also needs a writable tmpfs for `.next/cache`); `cap_drop: [ALL]`; `no-new-privileges`. |

## 5. Health checks, signals and shutdown

- **api**: liveness `/health/live` (no dependencies); readiness `/health/ready` checks the DB (`SELECT 1` with a 1 s timeout), Redis ping, and the expected migration version. Implement with `@nestjs/terminus` 12. The legacy `HealthIndicator` API was removed in v12 (D1 V-05).
- **worker**: a tiny HTTP server on `WORKER_HEALTH_PORT` (9464) exposing `/health` (heartbeat age < 60 s, Redis reachable) and `/metrics`.
- **web**: Route Handler `/api/health`, returning static OK with no backend calls.
- **Signals:** `tini` as PID 1 forwards SIGTERM. NestJS `enableShutdownHooks()`.
  - The API drains in-flight requests (`stop_grace_period: 30s`).
  - The worker calls `worker.close()` (`stop_grace_period: 60s`).
  - (Self-hosted PostgreSQL only: 60 s for a clean shutdown.)

## 6. Volumes, networks and secrets

| Volume | Service | Content | Backup |
| --- | --- | --- | --- |
| `valkey-data` | valkey | AOF/RDB | Not backed up (rebuildable; outbox replay) |
| — | database | On Supabase, no volume (ADR-019) | Supabase backups (J §8) |
| — | TLS certificates | `/etc/letsencrypt` on the host (certbot), not a volume | Optional (re-issuable) |

Secrets are files referenced in Compose `secrets:` and mounted at `/run/secrets/<name>`. Apps read `*_FILE` variables and build connection strings in memory, which Prisma 7 needs through the adapter configuration. Secret files live in `/opt/hms/secrets/` (0400, root). Rotation: RB-12.

## 7. Environment variable inventory

Non-secret values go in `.env` ([`env.example`](../templates/docker/env.example)). Secret values are files.

| Variable | Service(s) | Secret? | Example / default | Purpose |
| --- | --- | --- | --- | --- |
| `APP_ENV` | all | no | `production` | Behavior switches (no debug endpoints in production) |
| `LOG_LEVEL` | all | no | `info` | Logging |
| `CORS_ORIGINS` | api | no | `https://healthcare.bytespate.com` | Exact web origins allowed for CORS and the CSRF `Origin` check; comma-separated, no wildcards (ADR-021) |
| `NEXT_PUBLIC_API_URL` | web (**build argument**) | no | `https://healthcareapi.bytespate.com` | API origin the browser calls; compiled into the web bundle, so changing it needs a rebuild (ADR-021) |
| `PUBLIC_WEB_ORIGIN` | api | no | `https://healthcare.bytespate.com` | Links in emails and notifications |
| `DEFAULT_LOCALE` | web, api | no | `bn-BD` | Fallback language (C-025) |
| `DEFAULT_FACILITY_TIMEZONE` | api, worker | no | `Asia/Dhaka` | Setup default (AS-002) |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | api, worker, migrate | no | Supabase pooler host / `6543` for api and worker (transaction pooler), `5432` for migrate (session pooler) / `postgres` | DB location (ADR-019). Use the pooler host, not the IPv6-only direct host. Tables are in schema `hms` |
| `DB_USER` / `DB_PASSWORD_FILE` | api, worker | file | `hms_app` / `/run/secrets/db_app_password` | App role |
| `DB_MIGRATOR_USER` / `DB_MIGRATOR_PASSWORD_FILE` | migrate | file | `hms_migrator` | Migration role |
| `DB_POOL_MAX` | api, worker | no | `10` | Pool size per process ([M §6](M-capacity-performance.md#6-api-worker-scaling-and-database-connection-budgeting)) |
| `DB_STATEMENT_TIMEOUT_MS` / `DB_TX_TIMEOUT_MS` | api, worker | no | `15000` / `5000` | Guards against runaway queries/transactions |
| `VALKEY_URL` | api, worker | no (unless an ACL password is added → file) | `redis://valkey:6379/0` | Queues, cache, rate limits (Valkey speaks the Redis protocol, ADR-020) |
| `QUEUE_PREFIX` | api, worker | no | `hms` | BullMQ key prefix |
| `SESSION_SECRET_FILE` | api | file | — | Session token derivation/signing material |
| `CSRF_SECRET` (`CSRF_SECRET_FILE` in production) | api | file/secret | at least 32 characters | Key for the CSRF token HMAC (T-ACC-01). Rotating it logs everyone's CSRF tokens out until they reload the session |
| `FIELD_ENCRYPTION_KEY_FILE` | api, worker | file | — | NID field encryption (E §5.2) |
| `SESSION_IDLE_TIMEOUT_MIN` / `SESSION_ABSOLUTE_TIMEOUT_H` | api | no | `60` / `12` (C-032) | Platform defaults; hospital configuration overrides (CP-12) |
| `LOGIN_LOCKOUT_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | api | no | `5` / `15` (C-032) | Account lockout (T-ACC-03); hospital configuration overrides (CP-12) |
| `MFA_ENCRYPTION_KEY` | api | yes | 32 random bytes, base64 | Encrypts TOTP secrets at rest (T-ACC-04); losing it voids every enrolled authenticator |
| `MFA_ISSUER` | api | no | `HMS` | Name shown in authenticator apps (T-ACC-04) |
| `LOGIN_LOCKOUT_THRESHOLD` / `LOGIN_LOCKOUT_MINUTES` | api | no | `5` / `15` (PROPOSED) | Defaults (CP-12) |
| `COOKIE_DOMAIN` | api | no | **unset** | Leave unset: the session cookie is host-only on the API host. **Never** `bytespate.com`, which would send sessions to every subdomain, including the ecommerce site (ADR-021) |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_FORCE_PATH_STYLE` | api, worker | no | provider values | Object storage |
| `S3_ACCESS_KEY_FILE` / `S3_SECRET_KEY_FILE` | api, worker | file | — | Object storage credentials (least-privilege bucket policy) |
| `PRESIGNED_URL_TTL_SECONDS` | api | no | `300` | Download link lifetime |
| `PDF_RENDERER_URL` | worker | no | `http://pdf-renderer:3000` | Internal renderer |
| `WORKER_CONCURRENCY_PDF` / `WORKER_CONCURRENCY_REPORTS` | worker | no | `2` / `1` | Queue concurrency (D §10) |
| `OUTBOX_RELAY_BATCH` / `OUTBOX_RELAY_INTERVAL_MS` | worker | no | `200` / `500` | Relay tuning |
| `WORKER_HEALTH_PORT` / `METRICS_PORT` | worker, api | no | `9464` | Health and metrics |
| `API_INTERNAL_URL` | — | — | — | **Removed (ADR-021):** the Next.js server does not call the API with the user's session; the browser calls the API origin directly |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_SERVICE_NAMESPACE` | all | no | tools VPS endpoint | Telemetry |
| `ERROR_TRACKING_DSN` | all | treat as secret if the provider requires | empty | Error tracking |
| `FEATURE_DEPOSITS` / `FEATURE_DISCOUNTS` / `FEATURE_REFUNDS` / `FEATURE_PAYMENT_GATEWAY` | api, web | no | `false` | Platform-level kill switches for OPEN features. Hospital policy still governs once enabled. |
| `POSTGRES_PASSWORD_FILE`, `POSTGRES_DB`, `POSTGRES_INITDB_ARGS` | postgres | file | `--data-checksums` | Self-hosted PostgreSQL only (not used with Supabase) |
| pgBackRest repository credentials and cipher pass | postgres | file | — | Self-hosted PostgreSQL only (J §8) |
| `TURBO_TEAM` / `TURBO_TOKEN` | CI build only | CI secret | — | Remote cache (never in runtime images) |

## 8. Image versioning, publishing and migration execution

- **Tags:**
  - immutable `sha-<git-sha>` tags and **deploys by digest** (`image@sha256:…`)
  - human-friendly `vX.Y.Z` tags added at release
  - `latest` is never used in Compose files
- **Registry:** GHCR (`ghcr.io/<org>/hms-*`), private. The CI pushes with `GITHUB_TOKEN` package permissions. The production VPS pulls with a read-only token (environment secret).
- **Provenance:** build attestations and SBOM generation in CI (supported by Docker Buildx/GitHub; verify in L). The image scan runs before push and blocks critical vulnerabilities (L §5).
- **Migration execution:**
  1. The deploy script runs `docker compose --profile migrate run --rm migrate` with the **new** migrate image digest, before recreating app containers.
  2. `migrate.sh` applies Prisma migrations, which include the SQL for constraints and grants.
  3. A non-zero exit aborts the deploy with app containers unchanged.
  4. Migrations must be backward compatible with the running version (expand/contract, J §9.2).
- **Never** run migrations automatically at API container start. With multiple replicas, that causes races, and a failure leaves a half-started service.

## 9. Development Compose

The repository's `docker/compose.dev.yaml` runs **PostgreSQL 17** (matching Supabase, ADR-019) and **Valkey 9**, bound to `127.0.0.1` and checked on 2026-10-13. An S3-compatible dev store, an SMTP sink and the PDF renderer from the [template](../templates/docker/compose.dev.yaml) are added when the tasks that need them start. Developers and agents run `pnpm dev` for web/api/worker on the host. The init script creates the same database roles as production, with dev-only passwords, so RLS behavior matches. Test databases per agent are created from a migrated template (H §3).

## 10. What has and has not been checked

| Item | Checked? |
| --- | --- |
| Compose YAML syntax (`compose.prod.yaml`, `compose.dev.yaml`) | Parsed with a YAML parser |
| Dockerfiles build | **No** (no Docker daemon in the documentation workspace) |
| Containers run, health checks pass | **No** |
| Reverse proxy config | Caddyfile not used (ADR-020). The HMS nginx server blocks are validated with `nginx -t` on the host in T-OPS-01 |
| Development Compose (repository `docker/compose.dev.yaml`) | **Yes**, 2026-10-13: PostgreSQL 17.11 and Valkey 9.1.2 healthy |
| pgBackRest packaging in `Dockerfile.postgres` | **No** |
| Turborepo prune pattern | Matches the official guide (D1 V-20). Not executed. |

Task T-FND-05 builds and runs these templates, and replaces placeholders with pinned versions and digests.
