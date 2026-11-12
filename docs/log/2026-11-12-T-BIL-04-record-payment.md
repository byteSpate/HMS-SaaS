# T-BIL-04: record payment and print the receipt

- **Date:** 2026-11-12
- **Commit:** this commit
- **Implements:** T-BIL-04; UC-BIL-01, UC-BIL-02 (payment part); FR-BIL-002, FR-BIL-004, FR-BIL-011, FR-BIL-012, FR-BIL-019 (interim), FR-BIL-027, FR-BIL-034, FR-BIL-035; C-008, C-009, C-010, C-038, C-039, C-040; P-020, ADR-016, ADR-009; FPR-06, FPR-08; AT-BIL-003, -004, -006, -008, -011, -012, -013, -014, -016 (payment part), -018; FR-AUD-001

## What was built

With an open session, the **Cashier desk** shows today's queue (patients with invoices issued today that still owe, and how much) and a search by MRN, phone or name. Choosing a patient opens their open invoices as cards, **Doctor fee** apart from **Services** (C-008). Every unpaid line starts selected for its whole balance; the cashier can deselect a line or type a smaller amount for it (FR-BIL-012). More than a line still owes is stopped with an explanation (C-038). The cashier picks the method (cash, card, mobile, bank transfer), with a provider such as bKash and a reference for the others, and confirms.

One confirmation is **one payment** for all selected lines, even across the doctor-fee and service invoices (C-039). In one transaction the server checks the open session, locks the invoices, checks each line, and writes the payment, its allocations to lines, the lines' paid amounts and eligibility (fully paid = `ELIGIBLE`, C-040), the invoices' paid amount and status, a receipt number `RCPT-000001`, the audit event `billing.payment.recorded` and the outbox event `PaymentRecorded`. The desk then shows "Payment saved", the receipt number, each invoice's new balance, **Print receipt** and **Next patient**. The session's payments are listed under the desk with **Reprint**.

A print records a `receipt_print` row with the next copy number and returns the receipt page (A5, the screen's language); copy 2 and later say "Copy 2" (FR-BIL-027), every print is audited (`billing.receipt.printed`), and a print never creates a payment. The receipt lists each invoice paid, its lines, what this payment paid of it and its balance after, the amount received, the method with provider and reference, and the cashier.

Closing a session now expects the float plus the cash payments, and each other method its payments (T-BIL-03).

New routes: `POST/GET /api/v1/billing/payments`, `GET /billing/payments/{id}`, `POST /billing/payments/{id}/prints`, `GET /billing/invoices/queue`; `GET /billing/invoices` also takes `patientId` and `open=true`. New shared pieces: `findPatientRefs` (mod-patients), `hospitalNamesOf` (mod-identity-access), `createOpdWorld` (testkit: a hospital with a doctor fee, sessions, patients and check-ins over HTTP), `sumAmounts`/`compareAmounts` (web, exact in paisa), `printHtml` (web).

## Files

| File                                                                                                                                                                 | Purpose                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261112100000_payment/migration.sql`                                                                                           | `payment`, `payment_allocation`, `receipt_print` (append-only, RLS); `invoice_line.allocated_amount` with `invoice_line_allocation_within_net`, `eligibility` |
| `packages/database/prisma/schema.prisma`                                                                                                                             | `Payment`, `PaymentAllocation`, `ReceiptPrint`, the two line columns                                                                                          |
| `packages/contracts/src/payments.ts`, `invoices.ts`, `index.ts`                                                                                                      | Payment, allocation, receipt print and queue schemas; line paid amount, balance and eligibility; invoice list by patient                                      |
| `packages/mod-billing/src/domain/payment.ts` (+ spec)                                                                                                                | `planPayment`: sums, same patient, active lines, no overpayment, eligibility, new invoice states                                                              |
| `packages/mod-billing/src/infrastructure/payment.repository.ts`, `invoice.repository.ts`                                                                             | Session share lock, invoice locks in ID order, writes, session totals by method, print numbering; invoices by patient and today's open ones                   |
| `packages/mod-billing/src/application/payment.service.ts`, `receipt.ts`, `invoice.service.ts`, `cashier-session.service.ts`                                          | Record, read, list and print; receipt data; queue; real payment totals for sessions                                                                           |
| `packages/mod-billing/src/http/payments.controller.ts`, `invoices.controller.ts`, `billing.module.ts`, `package.json`                                                | Routes and wiring; depends on `@hms/i18n` and `@hms/print-templates` now                                                                                      |
| `packages/print-templates/src/receipt.ts`, `document.ts`, `index.ts`, `templates.test.ts`, `fixtures/samples.json`                                                   | Receipt for several invoices, copy number, provider and reference; optional hospital address                                                                  |
| `docs/deliverables/print-samples/receipt-*.pdf`                                                                                                                      | The three receipt samples rendered again                                                                                                                      |
| `packages/mod-patients/src/infrastructure/patient.repository.ts`, `index.ts`; `packages/mod-identity-access/src/infrastructure/department.repository.ts`, `index.ts` | `findPatientRefs`, `hospitalNamesOf`                                                                                                                          |
| `packages/testkit/src/opd-world.ts`, `index.ts`                                                                                                                      | `createOpdWorld`                                                                                                                                              |
| `apps/api/src/payments.api.spec.ts`                                                                                                                                  | 10 tests against PostgreSQL                                                                                                                                   |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                                                                                       | Desk texts under `cashier.*`; print labels for invoices, copy, balance after, amount received, reference and doctor-fee lines                                 |
| `apps/web/src/api/invoices.ts`, `payments.ts`, `src/money.ts` (+ test), `src/print-html.ts`                                                                          | Clients, exact sums, printing from a hidden frame                                                                                                             |
| `apps/web/src/components/cashier/payment-form.ts` (+ test), `payment-desk.tsx`, `patient-picker.tsx`, `receipts.tsx`; `app/(app)/cashier/page.tsx`                   | The desk                                                                                                                                                      |
| `apps/web/e2e/cashier.spec.ts`, `e2e/support/mock-payments.ts`, `mock-billing.ts`, `mock-api.ts`                                                                     | 2 more browser tests and the contract-valid mock                                                                                                              |

## Decisions applied

- **C-039 over the C04 interim rule:** C04 section 3 and UC-BIL-01 A2 still say "a payment belongs to one invoice (interim, Q-024)". Q-024 was answered by C-039 (one payment, several open invoices of one patient, one receipt), so the payment allocates to lines of any of that patient's open invoices. Lines of two patients in one payment are refused (`VALIDATION_FAILED` on `allocations`).
- **No expected invoice version on a payment:** the allocations name lines and amounts, and the server checks them against the lines under the invoice locks. A line added meanwhile is simply not paid, and a race for the same line ends in `AMOUNT_EXCEEDS_BALANCE` (AT-BIL-013) rather than `STALE_RECORD`; FR-BIL-034 allows either.
- **Locks (E section 9.1):** the open session `FOR SHARE` (closing it takes the row lock, so it waits for a payment in flight and a later payment finds it closed), then the invoices `FOR UPDATE` in ID order so two payments over the same invoices queue instead of deadlocking. `invoice_line_allocation_within_net` guards any path that skips them.
- **The balance after is stored** on each allocation (`invoice_balance_after`), so a reprint shows what the original receipt showed even after later payments or new lines.
- **The receipt is rendered on the server:** the print templates read the fonts from disk (Node only), and rendering beside the print record keeps one source for screen print and a later PDF (ADR-010). The browser prints the returned page from a hidden frame.
- **A print is a recorded event:** each print has its own Idempotency-Key and gets the next copy number under a per-payment advisory lock. `payment` has no UPDATE grant, so a row lock was not available there.
- **Numbering:** `RCPT-` and six digits, one sequence per hospital (patterns are open, Q-034).
- **No deposit option is offered** (C-040), so AT-BIL-007's `FEATURE_NOT_AVAILABLE` has no route to answer yet.
- **The browser never decides a balance** (FR-BIL-035): it adds what the cashier typed (in whole paisa, `sumAmounts`) to show the total and to stop a surely refused request; the server checks and answers with the new balances.

## Verification

| Command                                                        | Result                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` (local Docker only)                           | `20261112100000_payment` applied                                                                                                                                                                                                                           |
| `vitest run src/domain/payment.spec.ts` (mod-billing)          | Failed before the rules existed, then 6 of 6; mod-billing 22 of 22                                                                                                                                                                                         |
| `vitest run src/payments.api.spec.ts` (api, real PostgreSQL)   | 10 of 10, after one fix in the new test helper: it made a second session for the same doctor at the same time (refused by FR-SCH-001)                                                                                                                      |
| `vitest run` (print-templates; web money, payment form; i18n)  | 10 of 10; 4 and 4; 31 of 31, after removing `print.total` and `print.balance`, which the new receipt no longer uses                                                                                                                                        |
| `playwright test` (print-templates)                            | 6 of 6: one A5 page, embedded fonts, no network. The receipt samples were rendered again; the lab report samples were left as they were                                                                                                                    |
| `playwright test e2e/cashier.spec.ts`                          | 4 of 4, axe clean                                                                                                                                                                                                                                          |
| `pnpm turbo run build lint typecheck`, `pnpm boundaries:check` | 55 of 55 (a first run raced `next build` against the web typecheck over `.next/types`; the rerun passed); no violations (832 modules)                                                                                                                      |
| `pnpm turbo run test --concurrency=1`                          | A first run failed two outbox tests in platform on timing (both pass alone, 11 of 11). The rerun: every suite passed, platform 53, web 66, mod-billing 22, api 211 (25 files); it was stopped once for low memory, so the last suites ran in a second call |

## Known limitations

- **Only doctor-fee invoices exist on the real stack:** service lines come with orders and the service catalogue (T-ORD-01). The multi-line service card is covered by the browser test's mock and the domain rules.
- **The service gate** (`assertEligible`, AT-BIL-005, `PAYMENT_NOT_ELIGIBLE`) is T-ORD-02; this task stores the eligibility it will read.
- **The doctor's worklist** does not exist yet, so "the patient moves to WAITING" (UC-BIL-01 outputs) waits for T-CLI-01, which can read the doctor-fee line's eligibility.
- **An uncertain outcome** (timeout) shows the generic error here; "Check status" comes with T-BIL-05.
- **No method correction** (T-BIL-06), refunds, discounts or deposits.
- **Rounding to whole taka (C-037)** is not applied; amounts stay exact to two decimals, as the invoices are.
- **The receipt layout and Bangla wording** need the print review (T-PRN-02) and the native-speaker review of terms (A1). The hospital has no address on record yet, so the header shows its name only.
- **Supabase does not have this migration yet.**

Deploy impact: migration `20261112100000_payment` (three new tables, two columns and a CHECK on `invoice_line`, indexes, RLS policies, grants; expand-only, the new columns have defaults). mod-billing now bundles `@hms/print-templates` (fonts from `@fontsource/noto-sans-bengali`, already in the lockfile); no new variable, service or build step.

## How to debug

- **`INVALID_TRANSITION` with `reason: CASHIER_SESSION_NOT_OPEN`:** the cashier has no open session at the facility; open one on the desk.
- **`AMOUNT_EXCEEDS_BALANCE`:** the line has less left than the allocation; the problem carries `lineId` and `balance`. `SELECT net_amount, allocated_amount FROM hms.invoice_line WHERE id = '...'`.
- **`VALIDATION_FAILED` on `amount`:** the allocations do not add up to the amount. On `allocations`: lines of another patient.
- **Line paid amounts against allocations:** `SELECT l.id, l.allocated_amount, sum(a.amount) FROM hms.invoice_line l LEFT JOIN hms.payment_allocation a ON a.invoice_line_id = l.id GROUP BY l.id HAVING l.allocated_amount <> coalesce(sum(a.amount), 0)` should return nothing.
- **Which copy a reprint was:** `SELECT copy_no, language, printed_at, printed_by FROM hms.receipt_print WHERE payment_id = '...' ORDER BY copy_no`.
