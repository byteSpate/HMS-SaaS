# Feature log

One entry per completed feature or task, written in the same commit as the code. When something breaks later, start here: find the entry for the area, then follow its "How to debug" and "Known limitations".

## When to write an entry

- Write the entry in the same commit as the work it describes. Never create a branch or open a pull request only for a log entry.
- A summary that spans several features goes in a pull request description, or rides in the next feature pull request. It is not a branch of its own. If no feature branch is open, the entry waits and goes into the next feature commit.

## File naming

`YYYY-MM-DD-<task-id>-<short-slug>.md`, for example `2026-10-13-T-FND-04-tenant-rls.md`. Use the date the feature was finished. If there is no task ID, use a short slug only.

## Template

```markdown
# <Task ID>: <title>

- **Date:** YYYY-MM-DD
- **Commit:** <short sha> (fill in after committing, or "this commit")
- **Implements:** task IDs (T-XXX-NN), requirement IDs (FR-XXX-NNN, NFR-XXX-NNN), decisions (C-NNN, ADR-NNN)

## What was built

Two to five sentences in plain language: what a user or developer can now do.

## Files

| File            | Purpose  |
| --------------- | -------- |
| path/to/file.ts | one line |

## Decisions applied

Rules from A2/ADRs this code enforces, and anything chosen during the work (with the reason).

## Verification

| Command     | Result         |
| ----------- | -------------- |
| `pnpm test` | e.g. 12 passed |

## Known limitations

What is not done, what is stubbed, which open questions (Q-*) are excluded.

## How to debug

Where it can fail, which logs or queries to check, and how to reproduce locally.
```

## Entries

| Date       | Entry                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-13 | [T-FND-01/02/03: monorepo scaffold](2026-10-13-T-FND-01-monorepo-scaffold.md)                               |
| 2026-10-13 | [T-FND-04: tenant isolation with RLS](2026-10-13-T-FND-04-tenant-rls.md)                                    |
| 2026-10-14 | [T-ACC-01: login, sessions and CSRF](2026-10-14-T-ACC-01-login.md)                                          |
| 2026-10-14 | [Day summary](2026-10-14-day-summary.md)                                                                    |
| 2026-10-15 | [T-UI-01 (decisions): UI foundation](2026-10-15-T-UI-01-ui-foundation-decisions.md)                         |
| 2026-10-15 | [T-UI-01 S1: design tokens, themes and fonts](2026-10-15-T-UI-01-tokens.md)                                 |
| 2026-10-15 | [T-UI-01 S2 to S5: guardrails, hooks, primitives](2026-10-15-T-UI-01-primitives.md)                         |
| 2026-10-15 | [T-I18N-01 and T-UI-02: catalogs, app shell, sign-in](2026-10-15-T-UI-02-app-shell.md)                      |
| 2026-10-15 | [API status route and Swagger docs](2026-10-15-api-swagger-docs.md)                                         |
| 2026-10-15 | [Swagger: dev and production servers in one doc](2026-10-15-swagger-dev-prod-servers.md)                    |
| 2026-10-15 | [Docs: staging deployment and the development boundary](2026-10-15-docs-staging-deployment-boundary.md)     |
| 2026-10-18 | [Plan: request pipeline, permission guard, response envelope](2026-10-18-T-PLT-07-request-pipeline-plan.md) |
| 2026-10-18 | [CI: fix the Prisma generate race in @hms/database](2026-10-18-ci-prisma-generate-race.md)                  |
| 2026-10-18 | [T-PLT-07 (part 1): API request pipeline middleware](2026-10-18-T-PLT-07-request-pipeline.md)               |
