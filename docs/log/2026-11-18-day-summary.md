# Day summary: 2026-11-18

- **Date:** 2026-11-18
- **Commit:** rides with the next feature commit on `feat/ORD-orders`
- **Covers:** T-CLI-03 (merged), Next.js 16.4.6, T-ORD-01, T-VIS-02, T-ORD-03 (in progress)

## Done today

| Work                                                                         | Where                                           | State                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| T-CLI-03 prescription, medicine catalogue, prescribing lists                 | PR #59, squash-merged to `dev` as `c357f3c`     | Merged; branch deleted on all three remotes |
| CI audit exception GHSA-fc5q-39xc-vjpf (picomatch, no fix)                   | `pnpm-workspace.yaml` `auditConfig.ignoreGhsas` | Merged with PR #59 (owner decision)         |
| Supabase: `20261118090000_medicine_catalogue`, `20261118100000_prescription` | Supabase staging DB                             | Applied; 37 migrations, up to date          |
| Next.js 16.4.3 -> 16.4.6 (web, site), Supabase docs                          | `feat/ORD-orders` `a8d66ce`                     | Committed, pushed to all three remotes      |
| T-ORD-01 part 1: service catalogue and service prices                        | `feat/ORD-orders` `2d20873`                     | Committed, pushed                           |
| T-ORD-01 part 2: doctor orders on the consultation screen                    | `feat/ORD-orders` `7f8911a`                     | Committed, pushed                           |
| T-VIS-02 diagnostic visits with reception's direct orders                    | `feat/ORD-orders` working tree                  | Built and tested; **not committed**         |
| T-ORD-03 order cancellation (interim rule)                                   | `feat/ORD-orders` working tree                  | Built and tested; **not committed**         |

## Start here tomorrow

1. `git checkout feat/ORD-orders`. The working tree holds T-VIS-02 and T-ORD-03 (see `git status`), plus this summary and the log-date fix below.
2. Start Docker Desktop if it is stopped, then `pnpm services:up`.
3. Run the full suite: `set -a; . ./.env; set +a; pnpm turbo run test --concurrency=1`. If `packages/platform` `outbox.spec.ts` times out, the local outbox has a backlog from earlier test runs. Run that spec alone once to drain it, then run the suite again.
4. Commit T-VIS-02 and T-ORD-03 with `docs/log/2026-11-18-T-VIS-02-T-ORD-03-direct-orders-cancel.md`, then push to origin, reza and noman.
5. Open the feature PR into `dev`: "feat(orders): service catalogue, orders, direct orders and cancellation (T-ORD-01, T-VIS-02, T-ORD-03)". Deploy impact:
   - migrations `20261119090000_service_catalogue` and `20261119100000_service_order`
   - error codes `TEST_NOT_DIRECTLY_ORDERABLE` and `FEATURE_NOT_AVAILABLE`
   - Next.js 16.4.6
   - no new variable
6. Project lead's manual test, with `apps/api` `pnpm dev` (export `.env` first) and `apps/web` `pnpm dev`:
   - admin adds services on Services, prices them on Price list, and publishes
   - the doctor orders from the consultation
   - the cashier collects the service invoice
   - reception opens a diagnostic visit on the patient page and cancels an unpaid order
7. After the merge, apply the two migrations to Supabase the same way as today.

## Verified for the uncommitted work

| Check                                                                           | Result                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm turbo run build lint typecheck --continue`                                | 58 of 58                                                                                                           |
| `pnpm boundaries:check`, `prettier --check` on changed files, plain-ASCII check | Clean                                                                                                              |
| `vitest run src/orders.api.spec.ts` (api)                                       | 9 of 9                                                                                                             |
| `vitest run` (mod-clinical, web, i18n)                                          | 23, 106, 31 passed                                                                                                 |
| `CI=1 playwright test` direct-orders, orders, patients, appointments            | All pass on the production build                                                                                   |
| `pnpm turbo run test --concurrency=1`                                           | Not finished on 2026-11-18 (outbox backlog, then low memory). Rerun 2026-11-19 with `--force`: 35 of 35 tasks pass |

## Notes

- **Log dates:** the three T-ORD log entries were first written as 2026-11-19. They are renamed to 2026-11-18 in the working tree, and the index rows are updated.
- **Migration names:** the T-ORD migrations are named `20261119...`. That is only an ordering stamp, so they are left as they are.
- **Dev servers:** the API and web dev servers are stopped. Claude Code stopped the API for low memory; the web server was stopped for the production-build browser runs.
- **Next after this feature:** T-ORD-02 (the payment gate for departments), the lab chain from T-LAB-01 (needs Q-011, the pilot test set), and T-PRN-02 (order slip, expected report time on the receipt, reprint marking).
