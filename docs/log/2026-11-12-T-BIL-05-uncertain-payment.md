# T-BIL-05: uncertain payment outcome

- **Date:** 2026-11-12
- **Commit:** this commit
- **Implements:** T-BIL-05; FR-BIL-036; UC-BIL-01 R1; SP-08; FPR-08; F section 5 "Uncertain outcome"; AT-E2E-003 (browser part)

## What was built

When the answer to a payment is lost (a timeout, a lost connection, or a 5xx from a proxy after the server may have committed), the cashier desk no longer shows a generic error. It says "Checking whether the payment was saved..." and asks `GET /api/v1/operations/{key}` with the payment's Idempotency-Key (T-PLT-01):

- **Saved:** the desk shows the normal outcome: receipt number, new balances, Print receipt.
- **Not saved:** "The payment was not saved. Nothing was charged. Try again." **Try again** sends the payment once more **with the same key**.
- **The check itself failed:** "Could not check yet. Do not take the money again: check again first." with **Check again**.

While the outcome is not known, the Confirm payment button is not shown, so there is never a "Pay again" (FR-BIL-036). A refusal (4xx) saved nothing and is still shown as its error, with a new key for the next attempt.

## Files

| File                                                                          | Purpose                                                                              |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/web/src/api/operations.ts`                                              | Client for the outcome by key                                                        |
| `apps/web/src/components/cashier/payment-status.ts` (+ test)                  | Which failures are uncertain; saved, not saved or unknown                            |
| `apps/web/src/components/cashier/payment-desk.tsx`                            | `PaymentCheck` in place of the Confirm button while uncertain                        |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                | `cashier.checking`, `notSaved`, `tryAgain`, `checkFailed`, `checkAgain`              |
| `apps/web/e2e/cashier.spec.ts`, `e2e/support/mock-payments.ts`, `mock-api.ts` | 2 browser tests; the mock can lose the next answer, saved or not, and answers by key |

## Decisions applied

- **Try again keeps the key.** "Not found" can also mean the first request is still on its way. With the same key the server either replays the first payment or waits for it (the idempotency record's primary key), so a retry can never charge twice. Only a refusal gets a new key.
- **Each attempt is checked afresh:** the status query is keyed by the attempt's send time, so a second lost answer is not answered from the first check's cache.
- **The saved payment is reported once** to the desk, which then shows the outcome in place of the form.

## Verification

| Command                                                                         | Result                                                                                                                                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest run src/components/cashier` (web)                                       | 6 of 6 (payment status 2, payment form 4)                                                                                                                            |
| `playwright test e2e/cashier.spec.ts`                                           | 6 of 6, axe clean: a lost answer after saving finds the payment (one payment); a lost answer before saving offers Try again, which sends the same key and saves once |
| `pnpm turbo run build lint typecheck test --filter=@hms/web --filter=@hms/i18n` | All green after splitting two mock functions that the complexity rule refused; web 68, i18n 31                                                                       |
| `pnpm boundaries:check`                                                         | No violations                                                                                                                                                        |

Only the web app and the catalogs changed, so the API and module suites were not run again for this task (they ran green for T-BIL-04).

## Known limitations

- **The check is one question, not a poll:** if it cannot tell, the cashier presses Check again. Idempotency records expire after 7 days; a check after that finds nothing.
- **Only the payment uses it.** Other commands (session close, prints) still show the generic error after a lost answer; a print can simply be pressed again (it is a new copy).
- **Bangla texts** need the native-speaker review of terms (A1).

Deploy impact: none (web only; the operations route exists since T-PLT-01).

## How to debug

- **"Checking..." stays on screen:** the check request is pending; see the network tab for `GET /operations/{key}`.
- **Not saved, but the patient says they paid:** `SELECT idem_key, operation, status, created_at FROM hms.idempotency_record WHERE idem_key = '...'` and the session's payments on the desk.
