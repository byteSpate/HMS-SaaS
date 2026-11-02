# T-PLT-04: number sequences

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PLT-04; FR-CFG-003; C-033; CP-09; E sections 4 and 8

## What was built

A command can now get the next business number for its hospital inside its own transaction with `allocateBusinessNumber()`, formatted from a pattern such as `{PREFIX}-{seq:6}` (for example `SMH-000123`). Each hospital and each sequence counts separately.

## Files

| File                                                                 | Purpose                              |
| -------------------------------------------------------------------- | ------------------------------------ |
| `packages/database/prisma/migrations/20261102110000_number_sequence` | Table, RLS policy and grants         |
| `packages/domain-kernel/src/business-number.ts`, `.test.ts`          | Pure pattern formatting              |
| `packages/platform/src/number-sequence.ts`, `.spec.ts`               | Atomic allocation against PostgreSQL |

## Decisions applied

- **Padding never cuts:** a number that outgrows its width stays complete, so it stays unique.
- **The app cannot delete a sequence:** removing a row would restart its numbers and create duplicates.
- **The pattern comes from the caller:** only the MRN format is confirmed (C-033). Other formats stay open (Q-034), and per-hospital settings come with T-PLT-05.

## Verification

| Command                                  | Result                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| New tests before the code was exported   | Failed                                                          |
| `vitest run src/business-number.test.ts` | Passed, including refused patterns                              |
| `vitest run src/number-sequence.spec.ts` | Passed: 1,000 allocations by 20 parallel workers, no duplicates |
| Full suite                               | In the pull request's CI run                                    |

## Known limitations

- **Holding a number holds the row:** other commands on the same sequence wait until the first transaction ends, so a command must not do slow work after allocating.
- **The 1,000 allocation test runs through 20 parallel workers,** one per pooled connection. Starting all 1,000 at once made no duplicates, but some requests waited over 5 seconds for a connection, because allocations on one sequence run one after another.
- **No route uses it yet:** the first user is T-PAT-01. The hospital prefix has no setting until T-PLT-05.
- **Yearly reset** would use a sequence key with the year in it. Nothing does this yet, and C-033 says MRN never resets.

Deploy impact: migration `20261102110000_number_sequence` (additive, safe while the previous version runs).

## How to debug

Duplicate numbers should be impossible through this function: check for code writing `hms.number_sequence` directly. Slow commands that all allocate from one sequence usually mean a long transaction is holding the row, so look for slow work after the allocation.
