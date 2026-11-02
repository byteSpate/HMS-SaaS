# D1 — Stack assessment, alternatives and verified versions

| Control | Value |
| --- | --- |
| Document | D1 Technology assessment (authoritative for tool choices and version pins) |
| Version | 0.4.0-draft |
| Status | Core stack CONFIRMED (C-003). Supplied foundation (Prisma, Zod, Jest/E2E, SonarQube, Docker, CI/CD) is the agreed direction. **Supporting tools are PROPOSED (P-006)**, not approved. |
| Owner role | Technical architect |
| Review date of all version facts | **2026-10-12** (re-verify on the scaffold date) |

## 1. How tools were assessed

For each tool:
1. what job it does in **this** product
2. why it fits the hospital workflows (D §1 drivers)
3. its trade-offs
4. which alternative would be preferable, and when
5. its status

Version facts come from the npm registry and official documentation on 2026-10-12 (§5). A version is "verified" only in the sense that it exists and its declared engine/peer requirements were checked. **Nothing has been installed together and built yet.** That is the scaffold spike (T-FND-01..05 in [G](G-implementation-plan.md)).

## 2. Core and supplied foundation

| Tool | Job here | Fit for this project | Trade-offs | Prefer an alternative when… | Status |
| --- | --- | --- | --- | --- | --- |
| **TypeScript** | One language for web, API, worker, contracts | Shared Zod contracts across UI and API remove a whole class of mismatch defects (AD-8) | TS 7 (native compiler) is new, and parts of the ecosystem still pin TS 6 (CX-018) | — | Direction PROPOSED (v0.3); pin 6.0.x |
| **Next.js** | Staff UI (and later portal) | Layouts, i18n routing, server-side gating, one framework for staff and portal | Server runtime to patch; RSC/caching complexity (D §3) | The staff app gains nothing from SSR and the team prefers a static SPA → React + Vite (D §3) | **CONFIRMED** (C-003); usage constraints ADR-002 |
| **NestJS** | API and worker composition, DI, guards, interceptors, modules | Mirrors the modular-monolith structure; guards suit layered authorization; the standalone application context suits the worker | v12 moved packages to ESM; Jest needs Node ≥ 24.9 for ESM-only v12 packages | — | **CONFIRMED** (C-003) |
| **PostgreSQL** | System of record | Transactions, exclusion constraints (beds), partial unique indexes, RLS, `numeric`, `tstzrange`, `uuidv7()` (PG 18), JSONB for snapshots | Scaling beyond one primary needs replicas or partitioning ([M](M-capacity-performance.md)) | — | **CONFIRMED** (C-003) |
| **Turborepo** | Task graph and caching across the monorepo; `turbo prune --docker` | Agents can run only affected packages' tasks; Docker builds prune per app | Remote cache needs credentials or a self-hosted server | — | **CONFIRMED** (C-003) |
| **pnpm** | Package manager and workspace | Strict dependency isolation prevents phantom imports across modules; `pnpm deploy` creates production bundles | Three active majors (10/11/12) on 2026-10-12. Turborepo's lockfile parsing must support the chosen major (verify in spike) | Turbo cannot prune the chosen lockfile version → use the newest pnpm major that turbo supports | PROPOSED (v0.3) |
| **Prisma ORM 7** | Migrations, type-safe queries, client | Fast agent productivity; schema as documentation; driver adapter (`@prisma/adapter-pg`) uses node-pg pooling | Cannot express exclusion constraints, CHECK constraints, RLS policies or triggers in the schema. These go in SQL migrations ([E §7](E-database-design.md#7-prisma-mapping-and-postgresql-features-needing-sql)). Prisma 7 requires ESM and explicit `prisma.config.ts` | Heavy reporting SQL → use `$queryRaw` / TypedSQL or a SQL builder in `mod-reporting` | Supplied foundation; pin 7.10.x |
| **Zod 4** | Canonical schemas, validation, OpenAPI source, form resolvers | One schema serves API validation, client forms and docs (ADR-005) | NestJS bridge libraries lag NestJS 12 (CX-012) | — | Supplied foundation |
| **Jest 30** | Unit, PostgreSQL integration and API tests | Supplied direction; mature mocking; Supertest pairing | ESM support requires Node ≥ 24.9 and careful config; NestJS 12 defaults ESM projects to Vitest | The ESM spike shows instability or slowness → Vitest by explicit decision (Q-054, ADR-013) | Supplied foundation |
| **Browser E2E** | Staff journeys across UI + API + DB | — | — | — | Required; tool below |
| **SonarQube Community Build** | Static analysis, coverage tracking, quality gate on `main` | Free, self-hosted (C-023) | **Main branch only.** PRs are gated by other checks (CX-013, ADR-012). Needs ≥ 4 GB RAM; do not co-host with production | Branch/PR decoration becomes mandatory → Developer Edition | **CONFIRMED** (C-023) |
| **Docker / Compose** | Packaging and single-VPS orchestration | Same images in staging and production; simple ops (AD-8) | Compose is single-host; multi-host needs another orchestrator later ([J §13](J-vps-deployment-operations.md#13-upgrade-paths-beyond-one-vps)) | Several hosts with automated failover → Docker Swarm, Nomad or Kubernetes (only when needed) | Supplied foundation |
| **GitHub Actions** | CI/CD | Integrates with GitHub (C-022); OIDC; environments | Required reviewers for private repos need Enterprise (CX-014) | — | **CONFIRMED** (C-022) |

## 3. Proposed supporting tools

| Tool | Job here | Why it fits | Trade-offs | Alternative and when preferable | Recommendation |
| --- | --- | --- | --- | --- | --- |
| **TanStack Query v5** | Client server-state for worklists, invoices, polling, mutation invalidation | Worklists need polling, background refetch and precise invalidation after payments (FR-BIL-035). Standard pattern agents know. | Another cache to reason about. Rules in D §11. | SWR (simpler, fewer features); RSC-only fetching (unsuitable for interactive worklists) | **Adopt** (PROPOSED) |
| **React Hook Form 7 + @hookform/resolvers (Zod 4)** | Complex forms: registration, result entry, indents | Uncontrolled inputs keep large forms fast; the same Zod schemas validate client and server | Field arrays (multi-line indents) need care | TanStack Form (newer, fully typed) if RHF patterns prove awkward | **Adopt** (PROPOSED) |
| **TanStack Table v9** | Headless tables for worklists and reports with server-side sort, filter and pagination | Headless keeps full control over keyboard behavior and Bangla text | **v9 is a new major** (9.2.8 on 2026-10-12). Many examples online are v8; agents need v9 reference snippets in the context packet. | AG Grid Community for spreadsheet-like editing; plain tables for simple lists | **Adopt v9** with project examples, or pin v8 if the spike finds v9 gaps (PROPOSED) |
| **TanStack Virtual** | Virtualized long lists (bed board, large worklists) | Smooth scrolling for 1,000+ rows without paging when staff need it | — | Paging only | Adopt when needed |
| **Tailwind CSS v4** | Styling and design tokens | Fast, consistent spacing/typography; easy print CSS; agents generate it reliably | Long class lists. Use component abstractions in `packages/ui`. | CSS Modules | **Adopt** (PROPOSED) |
| **Component primitives:** shadcn/ui (copy-in, Radix or Base UI primitives) **or** React Aria Components | Accessible dialogs, comboboxes, menus, date pickers | Accessibility and keyboard behavior are requirements (NFR-UX-001, NFR-ACC-001). Copy-in components are owned code in `packages/ui`. | shadcn: large ecosystem, familiar to agents. React Aria: strongest keyboard and locale behavior, smaller ecosystem. | React Aria if the cashier/registration keyboard prototype finds combobox or date gaps in the shadcn variant | **Decide in spike T-UI-01** with a keyboard-heavy prototype (PROPOSED default: shadcn/ui on Tailwind v4) |
| **next-intl 4** | UI message catalogs, ICU plurals, locale formatting in Next.js | Peer supports Next 16; App Router support; bn/en catalogs (C-025) | Server/client message loading must be configured per route | i18next/react-i18next | **Adopt** (PROPOSED, ADR-017) |
| **BullMQ 6 + Redis-protocol server** | Durable job execution, retries, scheduling, concurrency control | Proven Node queue; `@nestjs/bullmq` 12 supports BullMQ 6; retries/backoff/stall recovery fit PDF, report and integration jobs | Redis is another stateful service; it must use `noeviction` and AOF | **pg-boss** (PostgreSQL-backed, transactional enqueue, one fewer service) if the team prefers minimal infrastructure on the first VPS | **Adopt BullMQ** with outbox as source of truth (ADR-006). The pg-boss alternative is documented. |
| **Redis 8 vs Valkey** | Server for BullMQ, cache, rate limits | Both speak the Redis protocol | Licence difference (CX-015); BullMQ server compatibility with Valkey must be proven in the spike | — | Owner chooses (P-010) |
| **S3-compatible object storage** | PDFs, exports, attachments, backups | Keeps large files out of PostgreSQL; presigned URLs; off-VPS durability | Another dependency; latency to the provider | Local filesystem volume for dev only | **Adopt S3 API**; provider storage or SeaweedFS/Garage. **Not MinIO CE** (CX-016, ADR-014). |
| **OpenAPI 3.1 (generated)** | API reference, client generation, contract drift check | Agents implementing UI and API in parallel need a frozen, generated contract | Generator choice for Zod 4 + NestJS 12 (CX-012) | — | **Adopt** (PROPOSED) |
| **OpenTelemetry** | Traces and metrics with correlation IDs | Diagnose "stale spinner" and slow-page complaints (SRC-B01, SRC-N02) end-to-end | SDK versions move fast (`@opentelemetry/sdk-node` 0.x) | Logs + metrics only at first (traces later) | **Adopt** progressively |
| **pino / nestjs-pino** | Structured JSON logs with redaction | Fast; redaction paths for PII (FR-AUD-006) | — | — | **Adopt** |
| **Prometheus + Grafana + Loki + Alloy** | Metrics, dashboards, logs, alerting | Self-hosted on a separate ops VPS; standard. Alloy replaces Promtail (EOL 2026-03-02). | Ops VPS cost and maintenance | A hosted observability service, if data-location decisions allow (Q-044) | **Adopt** (PROPOSED) |
| **Self-hosted error tracking (Sentry-compatible, e.g., GlitchTip)** | Exceptions with stack traces and releases | Keeps error data under the chosen hosting | Another service | Hosted Sentry if allowed | PROPOSED |
| **Caddy 2** | Reverse proxy, automatic HTTPS (ACME), headers | Minimal config; automatic certificate renewal; persistent data volume | Wildcard certificates need the DNS challenge (provider API token) | Nginx + certbot (familiar to many ops teams); Traefik (Docker labels) | **Adopt** (PROPOSED, ADR-011) |
| **pgBackRest** | Physical backups, WAL archiving, PITR to an S3 repo, encryption | Meets RPO/RTO proposals (NFR-REC-001); supports the current PostgreSQL majors | Learning curve | WAL-G | **Adopt** + periodic logical dumps (PROPOSED) |
| **PgBouncer** | Connection pooling when processes multiply | Transaction pooling compatible with transaction-local tenant context; `max_prepared_statements` supports prepared statements | Session features unavailable in transaction mode | Not needed on a single VPS with a few processes ([M §6](M-capacity-performance.md#6-api-worker-scaling-and-database-connection-budgeting)) | Add when the connection budget requires |
| **Playwright** | Browser E2E, keyboard-only flows, accessibility checks (axe), print-view snapshots | Multi-browser; trace viewer for agent debugging; `@axe-core/playwright` | Real printers cannot be tested in CI (UAT covers) | Cypress | **Adopt** (PROPOSED; resolves the v0.3 "E2E tool OPEN") |
| **Supertest** | HTTP-level API tests against the Nest app | Standard pairing with Jest | — | — | Adopt |
| **k6** | Load and soak tests with thresholds | Scriptable workflow scenarios; CI-friendly thresholds ([M §7](M-capacity-performance.md#7-load-test-methodology-and-measurable-targets)) | — | Artillery, Locust | **Adopt** (PROPOSED) |
| **ESLint 10 + typescript-eslint + eslint-plugin-sonarjs + Prettier** | Lint, PR-level code smells, formatting | `eslint-plugin-sonarjs` brings Sonar rules into PR checks, compensating for Community Build's main-only analysis (ADR-012) | Rule noise must be tuned | Biome (faster, but no SonarJS plugin) | **Adopt** |
| **dependency-cruiser** | Enforce package/module boundaries | NFR-MAINT-001 | Config upkeep | ESLint `import/no-restricted-paths`; Turborepo boundaries feature (verify status at scaffold) | **Adopt** |
| **argon2 (Node binding)** | Password hashing | argon2id recommended for password storage | Native module; build in Docker | — | Adopt |
| **Headless Chromium PDF renderer** (Gotenberg-style container or Playwright-based service) | PDF generation for archived documents | Chromium shapes Bangla correctly with proper fonts. Same HTML as browser print (ADR-010). | Memory-heavy; isolate and limit concurrency | — | **Adopt pattern**; choose the implementation in spike T-PRN-01 |
| **Security scanners:** gitleaks (CLI), OSV-Scanner or `pnpm audit`, an image scanner (Trivy **pinned by SHA** or Grype), hadolint, Dependabot | Secrets, dependency and image vulnerabilities, Dockerfile lint | NFR-SEC-004 | Trivy GitHub Actions had a tag-hijack compromise in March 2026. **All actions are pinned to full commit SHAs.** `gitleaks-action` needs a (free) licence key for organization repos; running the gitleaks CLI directly avoids that. | GitHub Secret Protection / Code Security (paid for private repos) | **Adopt** (PROPOSED; details in L) |

## 4. Verified versions and pinning recommendation

"Latest on 2026-10-12" is what the npm registry or the official page reported that day. **"Pin"** is the recommendation for the scaffold spike. Re-verify on the scaffold date, then commit `pnpm-lock.yaml` and record the exact versions in the repository's `docs/STACK_VERSIONS.md`.

| Component | Latest on 2026-10-12 | Relevant facts checked | Pin (PROPOSED) |
| --- | --- | --- | --- |
| Node.js | v24 "Krypton" LTS (maintenance from 2026-10-20, EOL 2028-04-30); v26 becomes LTS 2026-10-28 (EOL 2029-04-30) | NestJS 12 runtime: Node ≥ 20.19 / 22.12; its CLI needs 22.22.3+, 24.15+ or 26+. Jest with ESM-only Nest 12 packages needs Node ≥ 24.9. Prisma 7: ^20.19, ^22.12 or ≥ 24.0. | **Node 24.x LTS** for the spike. Re-evaluate **Node 26 LTS** after 2026-10-28 for the longer support window. Pin via `.nvmrc`, `engines` and Docker base image digest. |
| TypeScript | 7.0.2 (latest); 6.0.3 (latest 6.x) | `ts-jest` peer `<7`; `@nestjs/cli` 12 depends on `~6.0.2`; `@nestjs/swagger` peer `^5.5 \|\| ^6` | **6.0.x** |
| Next.js | 16.4.0 (2026-10-06); security release announced for 2026-10-14 | Engines Node ≥ 20.9; `middleware` renamed `proxy` in v16; `output: 'standalone'` documented | **First patched 16.4.x on or after 2026-10-14** (never 16.4.0) |
| React / React DOM | 19.3.0 | Next 16 peer `^19` | as resolved by Next |
| NestJS (`@nestjs/core`, `common`, `testing`, `platform-express`) | 12.1.2 (2026-09-30) | All packages ship ESM; CJS apps still supported; Express adapter drains in-flight requests on shutdown; Terminus legacy `HealthIndicator` API removed | **12.1.x** |
| `@nestjs/bullmq` | 12.0.0 | peer `bullmq ^3..^6`, Nest `^10..^12` | 12.0.x |
| `@nestjs/terminus` | 12.1.0 | peer Nest `^11 \|\| ^12` | 12.1.x |
| `@nestjs/config` | 12.0.1 | peer Nest `^11 \|\| ^12` | 12.0.x |
| `@nestjs/throttler` | 6.7.1 | peer includes Nest 12 | 6.7.x |
| Prisma (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | `@prisma/client` 7.10.0 (2026-08-25); **`prisma` CLI `latest` tag = 8.0.0-rc.22** | Prisma 7 requires a driver adapter, `prisma.config.ts`, ESM; env vars not auto-loaded; `$use` middleware removed; partial indexes supported via `where` on `@@index`/`@@unique` | **7.10.x for all three, pinned identically** (CX-017) |
| `pg` (node-postgres) | 8.23.1 | Used by `@prisma/adapter-pg`; no default connection timeout (set one) | 8.23.x |
| PostgreSQL | 18.6 current minor (18.x EOL 2030-11-14) | `uuidv7()` built in (also checked on a scratch 18.4 instance); RLS, exclusion constraints, `btree_gist` | **18.x, latest minor**; image pinned by digest |
| Turborepo (`turbo`) | 2.11.7 (2026-10-02) | `turbo prune <app> --docker` produces `out/json` and `out/full`; standalone release archives from 2.11.5 | **2.11.x** |
| pnpm | 12.11.2 (latest); 11.28.x and 10.34.x lines maintained | Must be supported by turbo's lockfile parser for `prune` | Choose in spike; record in `packageManager` |
| Zod | 4.6.6 | `@hookform/resolvers` and `zod-to-openapi` accept `^4` | **4.x** |
| `@asteasolutions/zod-to-openapi` | 9.1.0 | peer `zod ^4` | 9.1.x (if chosen) |
| `nestjs-zod` | 5.5.0 | peer Nest `^10 \|\| ^11` only | **Not selected** (CX-012) |
| TanStack Query | 5.104.2 | peer React ^18 \|\| ^19 | 5.x |
| TanStack Table | 9.2.8 | new major | 9.2.x (or 8.x, see §3) |
| React Hook Form / resolvers | 7.90.0 / 5.9.1 | resolvers peer `zod ^3.25 \|\| ^4` | 7.x / 5.x |
| Tailwind CSS | 4.3.3 | — | 4.x |
| next-intl | 4.14.9 | peer `next ^16` included | 4.x |
| BullMQ / ioredis | 6.3.12 / 6.0.0 | Production guide: `noeviction`, AOF, `maxRetriesPerRequest: null` for workers | 6.3.x / 6.0.x |
| Jest / ts-jest | 30.5.2 / 29.4.14 | ts-jest peer TS `<7` | 30.x / 29.4.x |
| Playwright / @axe-core/playwright | 1.64.0 / 4.13.0 | Next 16 lists Playwright `^1.51.1` as optional peer | 1.64.x |
| ESLint / eslint-plugin-sonarjs | 10.12.0 / 4.2.2 | plugin peer `eslint ^8 \|\| ^9 \|\| ^10` | 10.x / 4.x |
| pino / nestjs-pino | 10.4.0 / 5.3.1 | nestjs-pino peer Nest `^11.0.8 \|\| ^12.0.2`, Node ≥ 22.12 | 10.x / 5.3.x |
| OpenTelemetry (`@opentelemetry/sdk-node` / `api`) | 0.223.0 / 1.9.1 | 0.x SDK changes often | pin exact |
| argon2 | 0.45.1 | native module | 0.45.x |
| dependency-cruiser | 18.6.0 | — | 18.x |
| pgBackRest | 2.59.3 stable | S3-compatible repositories, encryption; supports current PostgreSQL majors | 2.59.x |
| PgBouncer | — (version not checked) | `max_prepared_statements` default 200; transaction pooling forbids session features | latest stable at scaffold (if used) |
| SonarQube Community Build | version not stated on the page reviewed | Main-branch analysis only; host needs ≥ 4 GB RAM / 2 cores (small); JS/TS coverage via `sonar.javascript.lcov.reportPaths` | latest Community Build at install |
| Caddy | — (not checked) | Automatic HTTPS needs DNS A/AAAA to the host, ports 80/443, persistent data dir; wildcard needs the DNS challenge | latest 2.x at scaffold |
| k6 | docs list v2.3.x | — | latest at scaffold |
| Grafana Alloy | — | Replaces Promtail (EOL 2026-03-02) | latest at scaffold |
| MinIO Community Edition | — | Binaries/images stopped Oct 2025; repository archived 2026 (secondary source) | **Do not adopt** |
| Trivy action | — | March 2026 tag-hijack compromise; only specific versions verified clean by the reporting source | Pin by full SHA after verifying the release, or use Grype |

## 5. Verification register (sources reviewed 2026-10-12)

| # | Source | Used for |
| --- | --- | --- |
| V-01 | npm registry (`npm view <pkg> version dist-tags peerDependencies engines`), queried 2026-10-12 | All package versions, peers and engines in §4 |
| V-02 | Node.js release schedule (`nodejs/Release` `schedule.json`) and nodejs.org blog "Evolving the Node.js Release Schedule" | Node LTS dates; change to yearly releases from Node 27 |
| V-03 | nextjs.org/blog (posts through 2026-10-08) | Next.js 16.4 release; announced 2026-10-14 security update; Dec 2025 RSC CVEs (CVE-2025-66478, CVE-2025-55183, CVE-2025-55184) |
| V-04 | nextjs.org docs: `output` (standalone) and `proxy` file convention (v16.4 docs) | Docker output; Proxy not to be relied on alone for authorization |
| V-05 | docs.nestjs.com migration guide (v12) | ESM, Node minimums, Jest on Node ≥ 24.9, TS 6 bump, Terminus changes |
| V-06 | prisma.io: Prisma 7 upgrade guide; ORM overview; unsupported database features; `prisma-client-extensions/row-level-security` README | Driver adapters, ESM, `prisma.config.ts`, env loading, partial indexes; RLS example caveats ("not intended for production") |
| V-07 | postgresql.org versioning policy | Supported majors and current minors |
| V-08 | Scratch PostgreSQL 18.4 instance (embedded binaries) used in this task | `uuidv7()`, RLS behavior, exclusion constraints and draft DDL syntax ([E §13](E-database-design.md#13-validation-performed-on-the-draft-sql)) |
| V-09 | pgbackrest.org | Current version and features |
| V-10 | pgbouncer.org configuration reference | `max_prepared_statements`; transaction-pooling limits |
| V-11 | docs.bullmq.io: Going to production; Connections | Redis configuration, shutdown, retries |
| V-12 | InfoQ (May 2025): Redis 8 AGPLv3 | Licence context (CX-015). No legal conclusion drawn. |
| V-13 | Secondary article on MinIO CE status (glukhov.org, 2026) | MinIO CE distribution status (CX-016). **Re-confirm against MinIO's own repository before relying on it.** |
| V-14 | docs.sonarsource.com (Community Build analysis overview; server host requirements; JS/TS coverage; Server 2025.1 branch analysis page) | Main-branch-only analysis; branch analysis from Developer Edition; host requirements; coverage parameter |
| V-15 | docs.github.com: Managing environments; About GitHub Advanced Security | Environment protection availability by plan; Secret Protection / Code Security purchase for private repos |
| V-16 | Snyk article on the Trivy GitHub Actions compromise (March 2026) | Pin actions by SHA |
| V-17 | gitleaks-action README (v2.3.9) | Licence key needed for organization accounts |
| V-18 | grafana.com Alloy docs: migrate from Promtail | Promtail EOL date |
| V-19 | caddyserver.com docs: Automatic HTTPS | Certificate requirements and storage |
| V-20 | turborepo.dev docs: Docker guide | `turbo prune --docker` pattern; remote cache in Docker builds |
| V-21 | ui.shadcn.com docs | Copy-in model |

## 6. Re-verification procedure at scaffold (task T-FND-01)

1. Re-run `npm view` for every package in §4. Record the date.
2. Read the release notes and security advisories for Next.js, NestJS, Prisma, PostgreSQL and Node since 2026-10-12.
3. Create the workspace with the pinned versions. Build `web`, `api` and `worker`. Run one Jest test (ESM), one Playwright test, `prisma migrate dev` against PostgreSQL 18, and `turbo prune` + Docker build for each app.
4. Record any version change and its reason in `docs/STACK_VERSIONS.md` and in an ADR amendment if a recommendation changes (e.g., Vitest instead of Jest).
5. Never claim a combination works until step 3 actually passed (v0.3 AGENTS rule).
