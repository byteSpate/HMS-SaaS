# Hotfix: Next.js remote code execution and Express denial-of-service advisories

- **Date:** 2026-11-01
- **Commit:** this commit
- **Implements:** T-FND-01 follow-up (known limitation "upgrade Next.js before any deploy"); D1 section 4; hotfix path in docs/GIT_WORKFLOW.md section 6

## What was fixed

`main` (v0.3.0) ran Next.js 16.4.0 in both web apps. `pnpm audit --prod` reported 6 advisories:

| Severity | Package     | Advisory                                               | Found  | Now    |
| -------- | ----------- | ------------------------------------------------------ | ------ | ------ |
| critical | next        | Unauthenticated remote code execution, image optimizer | 16.4.0 | 16.4.3 |
| critical | next        | Unauthenticated remote code execution, `use cache`     | 16.4.0 | 16.4.3 |
| high     | next        | Denial of service, App Router with Server Actions      | 16.4.0 | 16.4.3 |
| high     | body-parser | Denial of service, GHSA-27r3-jxmh-p828                 | 2.3.0  | 2.4.0  |
| high     | multer      | Denial of service, GHSA-q7qp-rjg7-q26m                 | 2.4.0  | 2.5.0  |
| moderate | qs          | `qs.stringify` with `arrayFormat: comma` throws        | 6.16.0 | 6.16.2 |

The T-FND-01 log and `docs/STACK_VERSIONS.md` both said never to deploy 16.4.0, but nothing enforced it, so the release tags carried it. `pnpm audit` is not part of CI; adding it belongs to the CI work of T-FND-03.

## Files

| File                                                                                                                       | Purpose                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| apps/web/package.json, apps/site/package.json                                                                              | Next.js 16.4.3                                              |
| apps/api/package.json, apps/worker/package.json, packages/platform/package.json, packages/mod-identity-access/package.json | NestJS 12.3.2, which requires multer 2.5.0                  |
| pnpm-workspace.yaml                                                                                                        | Overrides for body-parser 2.4.0 and qs 6.16.2               |
| pnpm-lock.yaml                                                                                                             | Resolved versions                                           |
| docs/STACK_VERSIONS.md                                                                                                     | New pins and the reason                                     |
| docs/log/README.md                                                                                                         | This entry, and five earlier entries missing from the index |
| apps/site/e2e/doctors.spec.ts                                                                                              | Two leave tests fix the browser clock inside the demo leave |

## Decisions applied

- **Merged into `dev`, not `main`:** this was opened as a hotfix into `main`, which staging runs (docs/DEPLOYMENT.md section 3). On 2026-11-02 it was decided that `main` stays at v0.3.0 and the fix ships with the next release, planned for 5 November 2026, so no v0.3.1 tag exists and docs/GIT_WORKFLOW.md section 6 was not followed.
- **Overrides for body-parser and qs:** Express's ranges already allow the patched versions, but the lockfile kept the old ones after the NestJS bump. The overrides are exact versions, with a comment saying when to remove them.
- **Release-age check kept:** the chosen versions pass `minimumReleaseAge`; the policy was not relaxed.
- **Date-dependent tests fixed here:** two site tests expected Dr. Tanvir Ahmed's demo leave (20 to 30 October 2026) on the real clock, so they fail on every branch since 31 October and would block this hotfix. They now set the clock, as the next-chamber test already did.

## Verification

| Command                    | Result                                            |
| -------------------------- | ------------------------------------------------- |
| `pnpm audit --prod` before | 6 vulnerabilities: 2 critical, 3 high, 1 moderate |
| `pnpm audit --prod` after  | No known vulnerabilities found                    |

The build, test and browser results for the final commit are in the pull request description and its CI run.

## Known limitations

- `main` and tag v0.3.0 keep Next.js 16.4.0 until the next release. Anything deployed from `main` before then stays exposed to the advisories above.
- Whether staging runs 16.4.0, and whether it was attacked while it did, cannot be told from this repository. The deployer must check (see Deploy impact).
- `pnpm audit` covers published advisories only, and only production dependencies were audited.

## Deploy impact

- **Rebuild and redeploy `web` and `api` as soon as the next release reaches `main`.** No new environment variable, migration, service or CORS change. The server Dockerfiles pin Node, pnpm and turbo, none of which changed.
- If 16.4.0 was reachable from the internet, treat the server as possibly compromised until checked: review the web container and nginx logs, and rotate the secrets it could read.

## How to debug

- **`pnpm audit --prod` reports something new:** read the path it prints. A direct dependency: bump the exact pin. A transitive one: bump its parent, or add an exact override in `pnpm-workspace.yaml` with a comment.
- **Install fails with `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`:** the version is under a day old; pick the previous patched release.
- **API misbehaves after the NestJS bump:** check `apps/api/src/http/configure-app.ts` (body parser, 1 MB limit) and `apps/api/src/http/request-pipeline.spec.ts`.
