# templates/ — illustrative configuration (not executed)

These files make the designs in K, L, E and M concrete. They are **templates**. Placeholders appear as `<<…>>` and must be replaced with verified, pinned values during the scaffold tasks (G: T-FND-01, T-FND-03, T-FND-05, T-OPS-01).

| File | Purpose | What was checked on 2026-10-12 |
| --- | --- | --- |
| `docker/Dockerfile.nest` | Multi-stage image for the NestJS api and worker (`--build-arg APP=…`) | Not built (no Docker daemon available) |
| `docker/Dockerfile.web` | Next.js standalone image | Not built |
| `docker/Dockerfile.migrate` | One-off migration job image | Not built |
| `docker/Dockerfile.postgres` | PostgreSQL 18 + pgBackRest | Not built |
| `docker/compose.prod.yaml` | T0 single-VPS production layout | YAML parsed only |
| `docker/compose.dev.yaml` | Local development services | YAML parsed only |
| `docker/env.example` | Non-secret settings with safe example values | Reviewed against K §7 |
| `docker/redis.conf` | BullMQ-required Redis/Valkey settings | — |
| `docker/initdb-10-roles.sh` | First-boot database roles from Docker secrets | `bash -n` syntax check only |
| `caddy/Caddyfile` | Reverse proxy, TLS, headers | Not validated (`caddy validate` in T-OPS-01) |
| `github/workflows/*.yml`, `github/dependabot.yml` | GitHub Actions pipelines and update policy | YAML parsed; `actionlint` 1.7.7 reported no findings. Shellcheck was not available, so `run:` scripts were not linted. **Not run on GitHub.** |
| `sonar/sonar-project.properties` | SonarQube Community project configuration | — |
| `sql/draft-core-schema.sql` | **Draft** PostgreSQL schema (not an approved migration) | **Executed on a scratch PostgreSQL 18.4** together with the probes |
| `sql/draft-validation-probes.sql` | 24 single-session probes (isolation, constraints, grants) | All 24 printed PASS |
| `sql/draft-validation-output.txt` | Log of the probe run plus two two-session race probes | — |
| `k6/front-desk-cashier.js` | Load-test skeleton for the reception and cashier journeys | Not run |

When copying a template into the application repository, place it at its conventional path, for example `.github/workflows/ci.yml`, `docker/Dockerfile.nest` or `infra/caddy/Caddyfile`. Then remove the "TEMPLATE — UNTESTED" header only after the file has actually been exercised.
