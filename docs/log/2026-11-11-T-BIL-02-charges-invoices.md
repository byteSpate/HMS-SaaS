# T-BIL-02: charge interface and invoices

- **Date:** 2026-11-11
- **Commit:** this commit
- **Implements:** T-BIL-02; FR-BIL-001, FR-BIL-006, FR-BIL-007, FR-BIL-008, FR-BIL-009 (invoice selection), FR-BIL-030, FR-BIL-031, FR-BIL-033; C-008; FPR-09; AT-BIL-002, AT-BIL-009, AT-BIL-010, AT-BIL-021, AT-BIL-022 (reduced), AT-CFG-002; ADR-003, ADR-007, ADR-009

## What was built

Other modules post charges through `postCharge(tx, scope, request, at)` from `@hms/mod-billing`, inside their own transaction, so the charge commits or rolls back with their change. Billing takes the price from the price list version in force at the service time (FR-BIL-007), puts the charge on the visit's invoice (a consultation on the DOCTOR_FEE invoice, anything else on the SERVICE invoice, C-008), creates that invoice on first use with a number `INV-000001`, adds the line, and keeps the invoice total and status in the same transaction. A posting repeated with the same source reference returns the first charge (FR-BIL-006); the same reference with other content is refused with `IDEMPOTENCY_KEY_REUSED` and logged as a warning. An item without a price in force is `POLICY_NOT_CONFIGURED` (FR-BIL-010 A1, used by check-in).

The cashier (`billing.invoice.issue`) reads invoices: `GET /api/v1/billing/invoices?visitId=` and `GET /api/v1/billing/invoices/{invoiceId}`, with lines, total, paid, balance and medicine and non-medicine subtotals, all computed from the same posted lines. Every posting writes the audit event `billing.charge.posted` and a `ChargePosted` outbox event. There is no screen yet: the cashier screens come with payments (T-BIL-04); check-in shows the doctor-fee invoice it issued (T-VIS-01).

## Files

| File                                                                                     | Purpose                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261111100000_invoice/migration.sql`               | `invoice`, `charge`, `invoice_line`; one doctor-fee and one service invoice per visit, source reference unique, amount CHECKs, RLS, column grants |
| `packages/database/prisma/schema.prisma`                                                 | `Invoice`, `Charge`, `InvoiceLine` and back-relations                                                                                             |
| `packages/contracts/src/invoices.ts`, `index.ts`                                         | Invoice, line, summary and list schemas                                                                                                           |
| `packages/mod-billing/src/domain/invoice.ts` (+ spec)                                    | Which invoice, line category, status from amounts, same posting, subtotals                                                                        |
| `packages/mod-billing/src/infrastructure/invoice.repository.ts`                          | Charge, invoice and line rows                                                                                                                     |
| `packages/mod-billing/src/application/post-charge.ts`                                    | `postCharge`                                                                                                                                      |
| `packages/mod-billing/src/application/invoice.service.ts`, `http/invoices.controller.ts` | The invoice read routes; `invoiceSummaryOf`                                                                                                       |
| `packages/mod-billing/src/billing.module.ts`, `index.ts`                                 | Wiring and exports                                                                                                                                |
| `apps/api/src/charges.api.spec.ts`                                                       | 6 tests against PostgreSQL                                                                                                                        |

## Decisions applied

- **C-008:** a doctor's fee has its own invoice; partial unique indexes allow one DOCTOR_FEE and one SERVICE invoice per visit.
- **FPR-09, FR-BIL-006:** the charge's source reference `(module, type, id, event)` is unique per hospital. "Same content" means the same patient, visit, item, practitioner and quantity.
- **FR-BIL-007, AT-BIL-002:** the request has no price field at all; the price always comes from the version in force at the service time, and the charge keeps that version (AT-CFG-002).
- **ADR-009:** charges are append-only (no UPDATE grant). An invoice changes only its total, paid, status and version; a line only its status.
- **FR-BIL-031:** the line insert first raises the invoice total with an UPDATE that locks the invoice row, so concurrent postings number their lines one after the other and the total always equals the lines. The first posting of a visit's invoice uses `ON CONFLICT DO NOTHING`, so two at once share one invoice.
- **FR-BIL-008:** the status is derived from total, paid and active lines; a new line on a PAID invoice makes it owe again.
- **Numbering:** `INV-` and six digits, one continuous sequence for both types (patterns are open, Q-034); a number may be skipped when two postings race for one invoice (FR-CFG-003 allows gaps).
- **No visit foreign key yet:** `invoice.visit_id` and `charge.visit_id` get their foreign keys with the visit table (T-VIS-01).

## Verification

| Command                                                          | Result                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` (local Docker only)                             | `20261111100000_invoice` applied                                                                                                                                                                                                                                                                                    |
| `pnpm --filter @hms/database test`                               | 28 of 28 (RLS coverage includes the new tables)                                                                                                                                                                                                                                                                     |
| `vitest run` (mod-billing)                                       | 9 of 9                                                                                                                                                                                                                                                                                                              |
| `vitest run src/charges.api.spec.ts` (api, real PostgreSQL)      | 6 of 6, after one fix: the clock jump in the AT-CFG-002 test was longer than the session idle timeout (401)                                                                                                                                                                                                         |
| Local CI (format, build, lint, typecheck, boundaries, all tests) | Build, lint, typecheck 52 of 52 (after fixing a `no-useless-assignment` lint error); no dependency violations; `turbo run test --concurrency=1` 30 of 30 tasks, api 190. A first run was stopped by Claude Code for low memory and left a Vitest process holding the coverage lock; it was stopped before the rerun |

## Known limitations

- **AT-BIL-022 is reduced:** the reconciliation query runs over concurrent postings of a test hospital, not over 10,000 synthetic invoices; the volume run belongs with the reporting work (T-REP-01).
- **AT-BIL-001 and payments** (paid, balance after payment) come with T-BIL-04.
- **The source-content conflict alert** is a log warning; it is not an audit event, because the refusal rolls the transaction back.
- **Only doctor-fee items** can be posted until the service catalogue exists (T-ORD-01).
- **Supabase does not have this migration yet.**

Deploy impact: migration `20261111100000_invoice` (three new tables, indexes, RLS policies, column grants; expand-only). No new variable, service or build step.

## How to debug

- **`POLICY_NOT_CONFIGURED` from a posting:** the item has no price in the version in force at the service time; see the T-BIL-01 log for "which fee applies now", and check `price_list_item` for the practitioner.
- **`IDEMPOTENCY_KEY_REUSED` from a posting:** the caller posted the same source reference with other content; `SELECT * FROM hms.charge WHERE source_id = '...'` and compare.
- **A total that does not match its lines:** run the reconciliation query in `apps/api/src/charges.api.spec.ts`; any row is a defect.
- **"permission denied for table charge":** an UPDATE was attempted on an append-only table.
