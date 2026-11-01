# T-FND-05 and T-FND-03: application images, image CI and dependency audit

- **Date:** 2026-11-01
- **Commit:** 7115701 and the commit that adds this entry
- **Implements:** T-FND-05; T-FND-03 (image scan, dependency audit); K sections 2, 3 and 5; L section 5; ADR-019, ADR-020, ADR-021

## What was built

The repository can now build every application as a Docker image: `api`, `worker`, `web`, `site` and `migrate`. Each uses `turbo prune`, the frozen lockfile and a Node base image pinned by digest. App images run as the `node` user under `tini`. A new `images` workflow builds each image, checks that it starts as non-root and answers its health check, and scans it with Trivy. CI also runs `pnpm audit --prod --audit-level=high`, so a release like the ones that carried Next.js 16.4.0 now fails the check.

Nothing is pushed or deployed. The server keeps building from its own Dockerfiles until the deployer chooses to move to these (docs/DEPLOYMENT.md section 1).

## Files

| File                                      | Purpose                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| docker/Dockerfile.nest                    | `api` and `worker`, without the Prisma CLI and other tools at run time     |
| docker/Dockerfile.next                    | `web` and `site`, Next.js standalone output                                |
| docker/Dockerfile.migrate                 | One-off `prisma migrate deploy`, with the Prisma CLI                       |
| docker/smoke-image.mjs                    | Starts an image; checks non-root and a 200 from its health path            |
| .dockerignore                             | Keeps `.env` files, `.git`, docs and build output out of the build context |
| .github/workflows/images.yml              | Build, smoke test and scan per image                                       |
| .github/workflows/ci.yml                  | Dependency audit step                                                      |
| apps/web/app/api/health/route.ts          | `GET /staff/api/health`, static, no backend call (K section 5)             |
| apps/web/e2e/staff-path.spec.ts           | Health route test                                                          |
| packages/config-eslint/guardrails.test.js | `fileURLToPath`, so the 18 guardrail tests also run on Windows             |
| docs/planning/docs/K-docker-design.md     | Section 10: what has now been built and checked                            |
| docs/DEPLOYMENT.md                        | Gap row: repository images exist, the server does not use them yet         |

## Decisions applied

- **K section 3 pattern**, with these differences found by building: `out/pnpm-lock.yaml` must be copied (the template forgot it), and `pnpm deploy` needs `--legacy` on pnpm 12.
- **Prisma tools removed from the API and worker images:** `@prisma/client` has an optional peer on the CLI, so a production install brings it, Studio, an embedded database, TypeScript and React. They are deleted in the build. The API image went from 887 MB to 672 MB, and a real login query still works without them. This closes the T-FND-01 known limitation, by deleting rather than by moving the CLI to a tools package, which would have changed the server's `db:deploy` command.
- **Environment variables, not secret files:** K section 6 plans `*_FILE` secrets, but the code and the server read plain variables today. Unchanged here.
- **Health paths:** the API uses its existing `/health`, not the `/health/live` and `/health/ready` planned in K section 5. The site uses `/robots.txt`, which needs no backend.
- **Trivy runs as a container pinned by digest, not as a GitHub Action,** and fails only on critical vulnerabilities that have a fix (L section 5).
- **The workflow runs on pull requests only when images could change,** because five builds are slow and private repositories have limited CI minutes (C-047). It always runs on pushes to `dev` and `main`.

## Verification

Run locally on Windows with Docker 29.9.2:

| Command                                                | Result                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `docker build` for all five images                     | All exit 0                                                                    |
| `node docker/smoke-image.mjs` for `api`, `web`, `site` | uid 1000; 200 from `/health`, `/staff/api/health`, `/robots.txt`              |
| `hms-worker` run directly                              | uid 1000; starts and exits 0, because `WorkerModule` is still empty           |
| `hms-api` against local PostgreSQL, `POST /auth/login` | 401 `INVALID_CREDENTIALS` from a real query, so the trimmed image still works |
| `hms-migrate` against local PostgreSQL                 | uid 1000; "No pending migrations to apply"                                    |
| Search for `.env` in `api`, `web`, `site`, `migrate`   | None                                                                          |
| `vitest run` in `@hms/config-eslint` on Windows        | 18 passed (all failed before)                                                 |

| Image       | Size    |
| ----------- | ------- |
| hms-web     | 404 MB  |
| hms-site    | 480 MB  |
| hms-worker  | 668 MB  |
| hms-api     | 672 MB  |
| hms-migrate | 2.21 GB |

## Known limitations

- **CI depends on the security hotfix:** until `main` (the Next.js and Express fixes) is merged back into `dev`, the audit step and possibly the critical scan fail on this branch.
- The workflow and the Trivy scan were not run locally; the first CI run on the pull request is their first run.
- `hms-migrate` is large because it keeps the whole pruned install. It runs once per deploy and is never served, so this was left alone.
- The worker has no health check and exits immediately until T-PLT-03 gives it work.
- The images were not run with the read-only filesystem and dropped capabilities of K section 4; those belong to a production Compose file, which the deployer owns.
- The images are not published to a registry (K section 8), and base image digests need refreshing for security updates.
- A new high or critical advisory now blocks every pull request until someone handles it. That is intended.

## Deploy impact

None for now: nothing on the server changes, and the server's own Dockerfiles keep working. On the next release, `GET /staff/api/health` exists. Moving the server to these Dockerfiles is the deployer's choice.

## How to debug

- **`no 200 from /health` from the smoke script in Git Bash on Windows:** Git Bash rewrites `/health` into a Windows path. Run with `MSYS_NO_PATHCONV=1`.
- **`Cannot find module` at container start in `api` or `worker`:** a package deleted in `Dockerfile.nest` is needed at run time; remove it from the `rm` list.
- **The web bundle calls the wrong API:** `NEXT_PUBLIC_API_URL` is a build argument, so rebuild the image.
- **The audit step fails with no code change:** a new advisory was published. Read its path, bump the pin or add an exact override (`pnpm-workspace.yaml`).
- **A build fails at `pnpm install` for age:** see `minimumReleaseAge` in docs/STACK_VERSIONS.md.
