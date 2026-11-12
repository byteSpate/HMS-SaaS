# T-BIL-03: cashier session

- **Date:** 2026-11-12
- **Commit:** this commit
- **Implements:** T-BIL-03; UC-BIL-04; FR-BIL-026; SRC-B07; AT-BIL-016, AT-BIL-017; FR-AUD-001; SP-03, SP-08; ADR-003, ADR-007

## What was built

A cashier (`billing.cashier_session.manage`, role CSH) sees **Cashier desk** in the menu. With no open session the desk says so and offers **Open session**, with an optional cash float (Bangla or Western digits). The open session shows since when it is open, the float, and what each method (cash, card, mobile, bank transfer) should hold: for cash the float plus cash payments. **Close session** asks for the amount counted for every method; the server stores the expected amount, the counted amount and the difference for each, and the dialog shows the result ("The counted amounts differ from what was expected", -20.00 in red).

Finance (`billing.cashier_session.review`, role FIN) sees **Cashier sessions**: closed sessions waiting for review (oldest first) and reviewed ones. **Review** shows the amounts and **Accept session**; a session with a difference needs a note. A user who closed the session cannot review it (`SEGREGATION_OF_DUTY`).

State: `OPEN -> CLOSED_PENDING_REVIEW -> REVIEWED`. Payments come with T-BIL-04; until then a session's expected amounts are its float only.

New shared pieces: `findStaffNames` in `@hms/mod-identity-access` (audit search now uses it too), `signedMoneyAmountSchema` and the error codes `AMOUNT_EXCEEDS_BALANCE` (409) and `SEGREGATION_OF_DUTY` (403) in `@hms/contracts`, `amountOf`/`positiveAmountOf` in `apps/web/src/money.ts` (the doctor-fee form uses it now).

## Files

| File                                                                                                                                                         | Purpose                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/database/prisma/migrations/20261112090000_cashier_session/migration.sql`                                                                           | `cashier_session` (one open per cashier and facility, state and reviewer CHECKs, RLS, column grant), `cashier_session_count` (insert-only) |
| `packages/database/prisma/schema.prisma`                                                                                                                     | `CashierSession`, `CashierSessionCount` and back-relations                                                                                 |
| `packages/contracts/src/cashier-sessions.ts`, `price-lists.ts`, `errors.ts`, `index.ts`                                                                      | Session schemas, payment methods, signed amounts, the two error codes                                                                      |
| `packages/mod-billing/src/domain/cashier-session.ts` (+ spec)                                                                                                | Expected amounts, variance, who closes and who reviews                                                                                     |
| `packages/mod-billing/src/infrastructure/cashier-session.repository.ts`                                                                                      | Session rows, advisory lock on open, row lock on close                                                                                     |
| `packages/mod-billing/src/application/cashier-session.service.ts`, `http/cashier-sessions.controller.ts`, `billing.module.ts`                                | The five routes under `/api/v1/billing/cashier-sessions`                                                                                   |
| `packages/mod-identity-access/src/infrastructure/staff-names.repository.ts`, `audit-search.repository.ts`, `index.ts`                                        | `findStaffNames`, shared                                                                                                                   |
| `apps/api/src/cashier-sessions.api.spec.ts`                                                                                                                  | 6 tests against PostgreSQL                                                                                                                 |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                                                                               | `cashier.*`, `cashierSessions.*`, `nav.cashier`, `nav.cashierSessions`, the two `errors.api` codes                                         |
| `apps/web/src/money.ts` (+ test), `components/doctor-fees/doctor-fee-form.ts`                                                                                | Shared typed-amount parsing                                                                                                                |
| `apps/web/src/api/cashier-sessions.ts`, `src/components/cashier/*`, `app/(app)/cashier/page.tsx`, `app/(app)/cashier-sessions/page.tsx`, `src/navigation.ts` | Desk, session panel and dialogs, review page                                                                                               |
| `apps/web/e2e/cashier.spec.ts`, `e2e/support/mock-billing.ts`, `mock-api.ts`                                                                                 | 2 browser tests and the contract-valid mock                                                                                                |
| `apps/api/vitest.config.ts`                                                                                                                                  | Test limit 20 s: API tests that log in several users took about 6 s on a busy laptop                                                       |

## Decisions applied

- **One open session per cashier per facility** (UC-BIL-04 D1): a partial unique index, and an advisory lock per cashier so two "open" clicks give one session and one `INVALID_TRANSITION` instead of a 500.
- **The float is part of the expected cash:** the drawer holds it, so a cashier who counts the float plus the takings has no difference.
- **Counts are stored, not recomputed:** closing writes one row per method (expected, counted, variance, with a CHECK that variance = counted - expected) and nothing updates them (FPR-06). A closed session always shows what was expected at closing.
- **Closing locks the session row** before it sums the payments. T-BIL-04's payment takes a share lock on the same row, so a payment in flight is counted, and none joins after the sums.
- **Segregation of duty** (UC-BIL-04 D2): the service refuses `SEGREGATION_OF_DUTY`, and a CHECK keeps the reviewer different from the cashier even for a direct write.
- **Only the session's cashier closes it** (`PERMISSION_DENIED` for another cashier), and a closed session cannot be closed again (`INVALID_TRANSITION`).
- **A difference needs a note** to be accepted (FR-BIL-026 "accepts the variance with a note"); without a difference the note is optional.
- **The close dialog reloads the desk only when its result is dismissed:** reloading at once would find no open session and take the result off the screen (found by the browser test).

## Verification

| Command                                                         | Result                                                                                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` (local Docker only)                            | `20261112090000_cashier_session` applied                                                                                                                                                 |
| `vitest run src/domain/cashier-session.spec.ts` (mod-billing)   | Failed before the rules existed, then 5 of 5                                                                                                                                             |
| `vitest run src/cashier-sessions.api.spec.ts` (api, PostgreSQL) | 6 of 6. The first run timed out one test at 5 s, because each test logged in four users; staff are now created on demand                                                                 |
| `vitest run` (i18n catalogs; web money and doctor-fee form)     | 31 of 31; 7 of 7                                                                                                                                                                         |
| `playwright test e2e/cashier.spec.ts`                           | 2 of 2, axe clean, after two fixes: the close result vanished (see above), and the totals table had the admin table's minimum width, which made it a scroll region in a dialog           |
| `pnpm turbo run build lint typecheck`, `pnpm boundaries:check`  | 55 of 55; no dependency violations (813 modules)                                                                                                                                         |
| `pnpm turbo run test --concurrency=1`                           | 31 of 32 tasks: two existing check-in tests timed out at 5 s (they take about 6 s here: five Argon2 logins each). With `testTimeout` 20 s in `apps/api/vitest.config.ts`, api 201 of 201 |

## Known limitations

- **No payments yet:** expected amounts are the float only until T-BIL-04.
- **One facility per hospital** (C-024): the session is at the hospital's facility.
- **A session left open overnight stays open;** there is no automatic closing or a "day" boundary (SRC-B07 daily finalization is the cashier closing it).
- **The collection report** (FR-REP-002) that reads sessions comes with T-REP-01.
- **Bangla texts** need the native-speaker review of terms (A1).
- **Supabase does not have this migration yet.**

Deploy impact: migration `20261112090000_cashier_session` (two new tables, indexes, RLS policies, column grants; expand-only). No new variable, service or build step.

## How to debug

- **`INVALID_TRANSITION` on open:** the cashier has an open session; `SELECT id, opened_at FROM hms.cashier_session WHERE cashier_id = '...' AND status = 'OPEN'`.
- **`PERMISSION_DENIED` on close:** another user's session; only its cashier closes it.
- **`SEGREGATION_OF_DUTY` on review:** the reviewer is the session's cashier; another finance user must review.
- **`VALIDATION_FAILED` on `note`:** the session has a difference; accept it with a note.
- **What a closing stored:** `SELECT method, expected, counted, variance FROM hms.cashier_session_count WHERE session_id = '...'`.
