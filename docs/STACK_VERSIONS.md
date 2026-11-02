# Stack versions

Recorded at scaffold on **2026-10-13** (T-FND-01, D1 §6). Versions were checked with `npm view` on that date. `pnpm-lock.yaml` is authoritative. Update this file in the same PR as any version change.

pnpm's `minimumReleaseAge` supply-chain check is on. Releases less than a day old are refused, so the previous release was pinned (noted below).

| Component                                          | Pinned                         | Note                                                                                 |
| -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| Node.js                                            | 24.x LTS (`.nvmrc`, `engines`) | Re-evaluate Node 26 LTS after 2026-10-28                                             |
| pnpm                                               | 12.11.2 (`packageManager`)     |                                                                                      |
| Turborepo                                          | 2.11.7                         |                                                                                      |
| TypeScript                                         | 6.0.3                          | Not 7.x: NestJS CLI and typescript-eslint require < 7 / < 6.1                        |
| NestJS core/common/platform-express/testing        | 12.3.2                         | Hotfix 2026-11-01: brings multer 2.5.0 (DoS advisory)                                |
| body-parser / qs (overrides, through Express)      | 2.4.0 / 6.16.2                 | Hotfix 2026-11-01: DoS advisories; set in `pnpm-workspace.yaml`                      |
| @nestjs/cli / schematics                           | 12.0.8 / 12.0.7                |                                                                                      |
| Next.js                                            | 16.4.3                         | Hotfix 2026-11-01. Never run 16.4.0 or older: unauthenticated RCE advisories (D1 §4) |
| React / React DOM                                  | 19.3.0                         |                                                                                      |
| Tailwind CSS                                       | 4.3.3                          |                                                                                      |
| Prisma CLI / client / adapter-pg                   | 7.10.0                         | npm `latest` is 8.0.0-rc; stay on 7.10.x (CX-017)                                    |
| pg                                                 | 8.23.1                         |                                                                                      |
| Zod                                                | 4.6.6                          | 4.6.7 was < 1 day old                                                                |
| Vitest / coverage-v8                               | 5.0.4                          | ADR-018                                                                              |
| unplugin-swc / @swc/core                           | 2.0.0 / 1.16.18                | Decorator metadata for NestJS tests                                                  |
| Playwright / @axe-core/playwright                  | 1.64.0 / 4.13.0                | Chromium headless shell 156                                                          |
| ESLint / typescript-eslint / eslint-plugin-sonarjs | 10.12.0 / 8.71.1 / 4.2.2       | typescript-eslint 8.71.2 was < 1 day old                                             |
| dependency-cruiser                                 | 18.6.0                         |                                                                                      |
| argon2                                             | 0.45.1                         | Native module; install script allowed in `pnpm-workspace.yaml` (T-ACC-01)            |
| cookie-parser / @types/cookie-parser               | 1.4.7 / 1.4.10                 | T-ACC-01                                                                             |
| @types/express                                     | 5.0.6                          | T-ACC-01                                                                             |
| Prettier                                           | 3.9.10                         |                                                                                      |
| PostgreSQL (local, CI)                             | 17 (17.11 resolved locally)    | Matches Supabase (ADR-019)                                                           |
| Valkey (local, CI)                                 | 9 (9.1.2 resolved locally)     | ADR-020                                                                              |

## Commands run on 2026-10-13 and their results

| Command                                      | Result                                                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                               | OK. Install scripts allowed only for `prisma`, `@prisma/engines` and `@swc/core`                                                 |
| `pnpm services:up`                           | Postgres 17.11 and Valkey 9.1.2 healthy                                                                                          |
| `prisma migrate dev --name init_tenant`      | Applied. `hms.tenant` and `hms._prisma_migrations` owned by `hms_migrator`. `hms_app` has SELECT but not DELETE and no BYPASSRLS |
| `pnpm build`                                 | 11/11 tasks successful                                                                                                           |
| `pnpm typecheck`                             | 16/16 successful                                                                                                                 |
| `pnpm lint`                                  | 16/16 successful                                                                                                                 |
| `pnpm test`                                  | 16/16 successful (contracts 2 tests, api 1 test)                                                                                 |
| `pnpm boundaries:check`                      | No violations. A probe file importing `@hms/database` from `apps/web` was rejected, then removed                                 |
| `pnpm --filter @hms/web test:e2e`            | 1 passed (home page + axe accessibility scan)                                                                                    |
| `node apps/api/dist/main.js` + `GET /health` | `{"status":"ok","service":"api",...}` on port 4100                                                                               |

Not yet run: the GitHub Actions workflow (no remote repository yet), Docker images, SonarQube, any Supabase connection.
