# CI: fix the Prisma generate race in @hms/database

- **Date:** 2026-10-18
- **Commit:** this commit
- **Implements:** CI reliability for T-FND-03 (ADR-012); no requirement change

## What was built

`pnpm turbo run build lint typecheck` failed intermittently with `TS6053: File '.../src/generated/prisma/models/*.ts' not found` in `@hms/database:build` (seen on PR #11; the rerun passed on unchanged code). Both `build` and `typecheck` ran `prisma generate` into the same `src/generated/` folder, and Turborepo ran the two tasks in parallel, so one task's `tsc` read the folder while the other was rewriting it. Generation now happens only in `build`, and `typecheck` and `test` wait for it.

## Files

| File                           | Purpose                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------- |
| packages/database/turbo.json   | Package-level Turborepo config: `typecheck` and `test` depend on own `build` |
| packages/database/package.json | `typecheck` no longer runs `prisma generate`                                 |

## Decisions applied

- `prisma generate` stays in the `build` script so a direct `pnpm --filter @hms/database build` still works on its own.
- `lint` is not ordered after `build`: the ESLint config is not type-aware, so it never reads the generated client.
- A package-level `turbo.json` (`extends: ["//"]`) keeps the rule local to the one package that generates code, instead of making every package's `typecheck` wait for its own `build`.

## Verification

| Command                                                                      | Result                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `pnpm turbo run build lint typecheck test --filter=@hms/database --dry=json` | `typecheck -> @hms/database#build`, `test -> @hms/database#build` |
| `pnpm turbo run build lint typecheck`                                        | see the PR                                                        |

## Known limitations

- A race can only be shown absent statistically; the task graph above is the real evidence that the two `prisma generate` runs can no longer overlap.
- Local installs need the pinned pnpm (`packageManager: pnpm@12.11.2`); pnpm 9 reports the lockfile as broken.

## How to debug

If `TS6053 ... src/generated ... not found` comes back, print the graph with `pnpm turbo run typecheck --filter=@hms/database --dry=json` and check `typecheck` still depends on `@hms/database#build`. Any new script that runs `prisma generate` must also be ordered against `build`.
