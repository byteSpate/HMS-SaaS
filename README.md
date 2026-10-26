# Hospital ERP

Whole-hospital ERP, starting in Bangladesh. Each customer hospital gets its own installation and domain (C-089). The planning pack is in [`docs/planning`](docs/planning/README.md). Start with its README, then [G — Implementation plan](docs/planning/docs/G-implementation-plan.md).

## Layout

```text
apps/
  web/        Next.js staff UI under /staff (port 3100)
  dev-proxy/  Development only: joins site and staff app on http://localhost:3000, like nginx
  site/       Next.js public hospital website, Bangla and English (port 3200, docs/site-planning)
  api/        NestJS HTTP API (port 4100)
  worker/     NestJS background jobs (BullMQ, outbox relay)
packages/
  contracts/      Zod schemas shared by api and web
  domain-kernel/  pure domain helpers (no I/O)
  database/       Prisma schema, migrations, client factory
  platform/       idempotency, outbox, audit, logging
  authz/          permission checks
  i18n/           Bangla + English catalogs and formatters
  ui/             design-system components
  testkit/        test fixtures (synthetic data only)
  config-typescript/
docker/           local services (Postgres 17, Valkey 9) and DB role setup
docs/             planning pack, source PDFs, STACK_VERSIONS.md
```

Dependency rules (for example, `web` never imports `database`) are enforced by `pnpm boundaries:check` (D §5).

## First-time setup

Requires Node 24, pnpm 12 and Docker.

```bash
pnpm install
cp .env.example .env
pnpm services:up                         # Postgres + Valkey in Docker
pnpm db:migrate                          # apply migrations
pnpm --filter @hms/web exec playwright install chromium
```

## Everyday commands

| Command                        | What it does                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | Run every app with hot reload; open `http://localhost:3000` (site) and `http://localhost:3000/staff` (staff app) through the dev proxy |
| `pnpm build`                   | Build everything                                                                                                                       |
| `pnpm test`                    | Vitest unit tests in every package                                                                                                     |
| `pnpm test:e2e`                | Playwright browser tests                                                                                                               |
| `pnpm lint` / `pnpm typecheck` | ESLint (incl. SonarJS rules) / TypeScript                                                                                              |
| `pnpm boundaries:check`        | Package dependency rules                                                                                                               |
| `pnpm format`                  | Prettier                                                                                                                               |
| `pnpm db:migrate`              | Create/apply a migration after editing `schema.prisma`                                                                                 |
| `pnpm db:studio`               | Browse the local database                                                                                                              |
| `pnpm services:down`           | Stop Postgres + Valkey (data is kept in Docker volumes)                                                                                |

## Decisions made at scaffold

- [ADR-018](docs/planning/docs/D2-adr/ADR-018-vitest.md): Vitest instead of Jest
- [ADR-019](docs/planning/docs/D2-adr/ADR-019-supabase-postgres.md): Supabase as managed PostgreSQL 17
- [ADR-020](docs/planning/docs/D2-adr/ADR-020-valkey-nginx-droplet.md): Valkey, nginx, existing droplet

## Branches and deployment

Work branches go into `dev`; release PRs go from `dev` into `main` ([docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)). Staging runs whatever is on `main` and is deployed by hand by the project lead. Development, including AI agents, never deploys and never needs server access. What is deployed, how `main` reaches it, and the "deploy impact" every change must state are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
