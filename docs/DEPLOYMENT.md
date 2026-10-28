# Staging deployment and the development boundary

Source: the HMS-SaaS Deployment Guide of 2026-10-15, written by the person who set up the server. That guide is a Word file held by the project lead and is not in the repository. This page keeps what developers and AI agents need from it. Secrets and the server address are deliberately left out.

## 1. The boundary (read this first)

Development and deployment are separate jobs with separate owners.

|           | Development (people and AI agents)                     | Deployment (project lead / teammate)            |
| --------- | ------------------------------------------------------ | ----------------------------------------------- |
| Where     | This repository and a local machine                    | The staging server and its provider consoles    |
| Branches  | Work branches, PRs into `dev`, release PRs into `main` | Pulls `main` on the server                      |
| Secrets   | `.env` with local dev values only                      | Server `.env`, Supabase and Cloudflare consoles |
| Done when | CI green, review, merged, log entry written            | Server updated and health checks pass           |

Rules for AI agents and for anyone working in this repository:

1. **Never deploy.** Do not run `redeploy.sh`, `docker compose` against a server, `certbot`, `nginx` or any deploy workflow, and do not write deploy automation unless the project lead asks for it in that session.
2. **Never ask for SSH access**, server credentials, Supabase passwords, Cloudflare access or the real `.env` of any environment. If a task seems to need them, stop and write what is needed under "Deploy impact" (section 4) instead.
3. **Develop against local services only.** `pnpm services:up` gives Postgres 17 and Valkey 9 in Docker, and `.env.example` holds the dev values. Local dev never points at Supabase or at the staging server.
4. **Keep `main` releasable.** Staging runs whatever is on `main`, so only reviewed release PRs from `dev` go there (section 3).
5. **Say what a change needs from the server.** Every PR and release PR states its deploy impact (section 4), so the person who deploys is never surprised.

## 2. What runs where

Staging is one small DigitalOcean droplet (Singapore) that also hosts an unrelated e-commerce site. HMS is isolated from it: its own nginx site file, its own certificate, containers bound to `127.0.0.1`, and memory limits. Everything for HMS lives in `/var/www/hms` on the server.

| Part                   | Value                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Web (Next.js)          | `https://healthcare.bytespate.com`, container on `127.0.0.1:3100`                   |
| API (NestJS)           | `https://healthcareapi.bytespate.com`, container on `127.0.0.1:4100`, `GET /health` |
| Database               | PostgreSQL 17 on Supabase (Singapore), schema `hms` (ADR-019)                       |
| Queue / cache          | Valkey 9 container, internal only, no published port (ADR-020)                      |
| Edge                   | Cloudflare (proxied DNS, SSL mode Full strict), then host nginx + Let's Encrypt     |
| Process manager        | Docker Compose, four services: `migrate`, `api`, `web`, `valkey`                    |
| Worker (`apps/worker`) | **Not deployed yet.** Planned; see section 5                                        |

Database roles on staging follow ADR-019 and CLAUDE.md: the API connects as `hms_app` through the transaction pooler (port 6543) and migrations run as `hms_migrator` through the session pooler (port 5432). The Supabase `postgres` and `service_role` users never reach the server.

## 3. How `main` becomes a running staging

```text
work branch --PR--> dev --release PR (merge commit)--> main --server pulls--> staging
 (squash)          (integration)      + tag vX.Y.Z      (deployable)   redeploy.sh
```

1. A release PR `dev` -> `main` is merged (docs/GIT_WORKFLOW.md section 5). **Merging does not deploy anything by itself.**
2. The person who deploys updates the server's `compose.yaml` and `.env` if the release needs it (section 4), then runs `/var/www/hms/redeploy.sh` on the server.
3. `redeploy.sh` runs `git pull --ff-only` on `main` from `NOMAN1802/HMS-SaaS`, which is the `noman` remote (renamed from `NOMAN1802/HMS-ERP`; confirmed 2026-10-23, its `main` matches `origin`), so `main` reaches the server through the usual push to all three remotes. It then builds the `migrate`, `api` and `web` images one at a time, runs `docker compose up -d`, then checks `GET /health`. The `migrate` service runs `pnpm --filter @hms/database db:deploy` first and the API starts only if it exits 0.
4. A hotfix follows the same path: PR into `main`, patch tag, server pull, then merge `main` back into `dev`.

Consequences that matter for code:

- **Migrations run automatically on every deploy**, as part of `docker compose up`. They must be safe to apply to the running version (expand first, contract later: J section 9.2). A rollback of the code does not undo a migration that already ran.
- **Rollback is a manual checkout of an older commit** on the server, then a rebuild. It is possible only while the migrations since then were expand-only.
- **`NEXT_PUBLIC_API_URL` is baked into the web image at build time.** Changing the API address means rebuilding the web image. Code must keep reading it only through `apps/web/src/config.ts`.
- The server builds from source with `turbo prune @hms/api --docker` and `@hms/web`. Tool versions are pinned in the server Dockerfiles (pnpm 12.11.2, turbo 2.11.7, Node 24 slim). If the root `package.json` pins change, the Dockerfiles need the same bump.
- A deploy is only as good as `main`: CI runs on every PR and on pushes to `dev` and `main`, but no deploy workflow, image registry or SonarQube job exists yet (T-FND-03, T-FND-05).

## 4. Deploy impact: what every PR and release PR must state

Put a **Deploy impact** line in the PR description, and in the `docs/log/` entry when it is not "none". Use this table to decide.

| If the change...                                              | Say this under Deploy impact                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| reads a new environment variable (api, web or worker)         | The variable name, whether it is required, a safe example, and which service reads it |
| changes the meaning or format of an existing variable         | Old and new format, and what happens to a server that still has the old one           |
| adds or changes a Prisma migration                            | The migration name, whether it is expand-only or a contract step, and any long lock   |
| adds a service or app (for example `apps/worker`)             | The container, its port or none, its memory need, its env, and its start order        |
| adds a build or codegen step (generate, OpenAPI, copy assets) | The command, and in which Docker stage it must run                                    |
| changes the API origin, cookie or CORS behavior               | The affected hostnames, `CORS_ORIGINS`, and whether the web image must be rebuilt     |
| bumps Node, pnpm, turbo or a base image                       | The new version; the server Dockerfiles pin these                                     |
| needs a new external service or secret                        | What it is and who must create it; never paste the value anywhere                     |
| none of the above                                             | `Deploy impact: none`                                                                 |

The release PR's description collects the lines of every PR it contains, so the deployer has one list.

## 5. Gaps between this repository and the server

These are known and tracked here so nobody rediscovers them during a release.

| Gap                                                                                            | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                                                                    |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `CSRF_SECRET` is not set in the server `compose.yaml`                                          | `main` has no login code yet. The first release that includes T-ACC-01 fails at API start ("CSRF_SECRET must be at least 32 characters") unless the secret is added first. `SESSION_IDLE_TIMEOUT_MIN` and `SESSION_ABSOLUTE_TIMEOUT_H` are optional                                                                                                                                                                                                                                                            | Deployer, before the release                                             |
| `MFA_ENCRYPTION_KEY` is not set in the server `compose.yaml` (T-ACC-04)                        | The first release that includes T-ACC-04 fails at API start ("MFA_ENCRYPTION_KEY must be 32 bytes in base64") unless it is added first. Generate it once per installation with `openssl rand -base64 32` and keep it with the other secrets: losing or changing it makes every enrolled authenticator unusable, and administrators must then reset and re-enrol. `MFA_ISSUER` (default `HMS`), `LOGIN_LOCKOUT_ATTEMPTS` and `LOGIN_LOCKOUT_MINUTES` are optional                                               | Deployer, before the release                                             |
| `Dockerfile.nest`, `Dockerfile.web`, `compose.yaml` and `redeploy.sh` exist only on the server | They are not reviewed or versioned, and can drift from the code. Plan: move them into a `deploy/` folder in the repo                                                                                                                                                                                                                                                                                                                                                                                           | Deployer, then a reviewed PR                                             |
| `apps/worker` is not in `compose.yaml`                                                         | Background jobs and the outbox relay do not run on staging                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Deployer, when T-PLT-03 lands                                            |
| Staging has no automatic deploy, smoke test or image scan                                      | Verification is manual: `GET /health` and opening the web app                                                                                                                                                                                                                                                                                                                                                                                                                                                  | T-FND-03, T-FND-05                                                       |
| Database passwords were once pasted into a chat                                                | They must be rotated before real patient data goes in                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Project lead                                                             |
| Swagger UI is served at `/docs` in every environment (PR #8)                                   | It is registered outside the API's session guard and has no environment switch, so the API documentation becomes public on the staging API host once released. `API_PUBLIC_URL` is optional and defaults to the production hostname                                                                                                                                                                                                                                                                            | Project lead to decide                                                   |
| The staff app moved under `/staff` on `dev` (T-WEB-18, Q-087)                                  | The next release that includes it changes every staff URL: the web image must be rebuilt (the `/staff` base path is baked in at build), and nginx needs `location /staff { proxy_pass http://127.0.0.1:3100; }`. The public site is not deployed yet, so until its container runs on `127.0.0.1:3200` the root needs `location = / { return 302 /staff; }`; afterwards `location / { proxy_pass http://127.0.0.1:3200; }` (D section 13 of the site planning pack). Testers' bookmarks change to `/staff/...`. | Project lead to agree before the release (Q-087), deployer applies nginx |

## 6. Local development versus staging

| Item                     | Local (`.env`)                             | Staging (server `.env` and `compose.yaml`)                            |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------------- |
| `DATABASE_URL`           | `hms_app` on `localhost:5432`              | `hms_app` on the Supabase transaction pooler, port 6543, `schema=hms` |
| `DATABASE_MIGRATOR_URL`  | `hms_migrator` on `localhost:5432`         | `hms_migrator` on the Supabase session pooler, port 5432              |
| `VALKEY_URL`             | `redis://localhost:6379/0`                 | `redis://valkey:6379/0` (set in `compose.yaml`)                       |
| `CORS_ORIGINS`           | `http://localhost:3100`                    | `https://healthcare.bytespate.com`                                    |
| `NEXT_PUBLIC_API_URL`    | unset, defaults to `http://localhost:4100` | `https://healthcareapi.bytespate.com`, a build argument               |
| `CSRF_SECRET` and others | dev-only value from `.env.example`         | A real secret generated by the deployer                               |

Never copy a local `.env` to the server: its `localhost` database URL is exactly what broke the first staging deploy (migrate exits with `P1001`).

## 7. Symptoms a developer may be shown, and where to look in the code

The deployer owns fixing the server. This table only points a developer at the cause in the code.

| Symptom reported from staging                                                 | Likely cause                                             | Look at                                                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `migrate` exits 1 with `P1001` (cannot reach `localhost:5432`)                | Server `.env` holds local values                         | Section 6; server-side fix only                                                     |
| API container restarts, log says `CSRF_SECRET must be at least 32 characters` | Release needs a new variable the server does not have    | `packages/mod-identity-access/src/application/auth.config.ts`; add to Deploy impact |
| API log says `DATABASE_URL is required`                                       | Variable missing from `compose.yaml`                     | `apps/api/src/app.module.ts`                                                        |
| Web loads but sign-in calls `localhost:4100`                                  | Web image built without `NEXT_PUBLIC_API_URL`            | `apps/web/src/config.ts`; rebuild the web image                                     |
| Browser blocks API calls with a CORS error                                    | `CORS_ORIGINS` does not list the web origin              | `apps/api/src/http/cors.ts`                                                         |
| `502 Bad Gateway` on the API host                                             | API container is not up (often because `migrate` failed) | Migration files in `packages/database`                                              |
| `ERR_TOO_MANY_REDIRECTS`                                                      | Cloudflare SSL mode is Flexible, not Full (strict)       | Provider console only; not a code problem                                           |

## 8. Open follow-ups (owned by the deployer)

- Rotate the Supabase admin, `hms_app` and `hms_migrator` passwords, then rewrite the server `.env`.
- Confirm Cloudflare SSL/TLS is Custom, Full (strict), and that the shop and both HMS names load.
- Confirm swap survives a reboot and that `certbot renew --dry-run` succeeds.
- Move the two Dockerfiles, `compose.yaml` and `redeploy.sh` into the repository (`deploy/`) through a reviewed PR.
- Add `apps/worker` to Compose when it is ready.
- Add `CSRF_SECRET` to the server before the first release that contains login.

When one of these is done, update this page in the same PR that records it.

## 9. Related documents

- [GIT_WORKFLOW.md](GIT_WORKFLOW.md): branches, releases and hotfixes.
- [J VPS deployment and operations](planning/docs/J-vps-deployment-operations.md) and [L CI/CD](planning/docs/L-cicd-sonarqube.md): the target design. This page records what is true today.
- [ADR-019](planning/docs/D2-adr/ADR-019-supabase-postgres.md), [ADR-020](planning/docs/D2-adr/ADR-020-valkey-nginx-droplet.md), [ADR-021](planning/docs/D2-adr/ADR-021-separate-web-api-origins.md): database, queue and edge decisions.
