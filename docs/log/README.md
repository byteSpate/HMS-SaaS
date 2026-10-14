# Feature log

One entry per completed feature or task, written in the same commit as the code. When something breaks later, start here: find the entry for the area, then follow its "How to debug" and "Known limitations".

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

| Date       | Entry                                                                         |
| ---------- | ----------------------------------------------------------------------------- |
| 2026-10-13 | [T-FND-01/02/03: monorepo scaffold](2026-10-13-T-FND-01-monorepo-scaffold.md) |
| 2026-10-13 | [T-FND-04: tenant isolation with RLS](2026-10-13-T-FND-04-tenant-rls.md)      |
| 2026-10-14 | [T-ACC-01: login, sessions and CSRF](2026-10-14-T-ACC-01-login.md)            |
| 2026-10-14 | [Day summary](2026-10-14-day-summary.md)                                      |
