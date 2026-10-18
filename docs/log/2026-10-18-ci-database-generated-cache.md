# CI: cache the generated Prisma client with the database build

- **Date:** 2026-10-18
- **Commit:** this commit
- **Implements:** CI reliability for T-FND-03 (ADR-012); follow-up to [the Prisma generate race fix](2026-10-18-ci-prisma-generate-race.md) (PR #12)

## What was built

A review of PR #12 found that `@hms/database#build` cached only `dist/**` (the root default), while `prisma generate` writes the client to `src/generated/`. On a cache hit Turborepo restores the cached outputs and skips the script, so a clean checkout (or `git clean`) ended up without `src/generated/`, and any task that then ran and imported it (`test`, a dependent build) failed. The database package now declares `src/generated/**` as a build output, so a cache hit restores it.

## Files

| File                         | Purpose                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| packages/database/turbo.json | `build` outputs are `dist/**` and `src/generated/**` (gitignored) |

## Decisions applied

- The output list is set in the package's own `turbo.json`, next to the rule from PR #12, because only this package generates code into `src/`.
- `dist/**` is repeated because a package-level `outputs` replaces the root list instead of adding to it.

## Verification

| Command                                                                                     | Result                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Before: `turbo run build` (fill cache), delete `src/generated`, `turbo run build typecheck` | `build` cache hit, `src/generated` still missing (bug reproduced)                                   |
| After: same steps with `test` added                                                         | `build` cache hit restores `src/generated/prisma/*`; `typecheck` ran and passed                     |
| `pnpm --filter @hms/database exec vitest run` (local)                                       | Integration tests reach PostgreSQL but fail login (no local database on this machine); CI runs them |

## Known limitations

- The cache now stores the generated client (a few MB per build hash). That is the cost of a correct restore.

## How to debug

If `Cannot find module '.../src/generated/prisma/...'` or `TS6053` appears after a cache hit, run `pnpm turbo run build --filter=@hms/database --dry=json` and check that `outputs` lists `src/generated/**`. `pnpm --filter @hms/database db:generate` rebuilds the client by hand.
