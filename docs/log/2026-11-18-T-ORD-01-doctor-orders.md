# T-ORD-01 (part 2): doctor orders from the consultation

- **Date:** 2026-11-18
- **Commit:** this commit
- **Implements:** T-ORD-01; FR-ORD-002, FR-ORD-003, FR-ORD-004, FR-ORD-005, FR-ORD-007, FR-ORD-008; UC-CLI-01 step 3; C-008, C-011; FPR-09; SP-01; FR-AUD-001

## What was built

The consultation screen has an **Orders** section for the doctor (`order.service.create`):

- **Entry:** type a code or name, then Enter or a click adds the service to a list and empties the box for the next one (FR-ORD-008). Each entry has a priority (routine or urgent) and an optional clinical note. "Place orders" sends the list in one request with an Idempotency-Key.
- **Charging:** each service becomes one `service_order` and one charge, in the same transaction. Billing prices it from the version in force and puts it on the visit's SERVICE invoice (FR-ORD-003, C-008), so the cashier collects it like any invoice.
- **The list:** each order shows its own status (Requested) beside its payment state read from the invoice line (Paid, Not paid), the amount and the expected report time (FR-ORD-004, FR-ORD-007). A paid doctor fee never makes an order paid (FR-ORD-005, tested).

The order keeps the service as it was when ordered: code, names, category, report hours and catalogue version (FR-ORD-002). It also keeps the requester from the session, the doctor, the consultation and the source CONSULTATION. Each order writes an audit event and a `ServiceOrdered` outbox event.

New routes:

- `GET` and `POST /consultations/{id}/orders`
- `GET /orders/services?q=`, the doctor's picker
- `GET /orders/direct-services?q=`, reception's picker, directly orderable services only, which the next part uses

New shared pieces:

- `placeOrders` (mod-clinical), shared with reception's direct orders
- `findLineStates` (mod-billing)
- error codes `TEST_NOT_DIRECTLY_ORDERABLE` (422) and `FEATURE_NOT_AVAILABLE` (409), the second used by cancellation

## Files

| File                                                                                             | Purpose                                                                                        |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261119100000_service_order/migration.sql`                 | `service_order`: links, source/priority/status/cancel CHECKs, RLS, fulfilment-only grants      |
| `packages/database/prisma/schema.prisma`                                                         | `ServiceOrder` and its relations                                                               |
| `packages/contracts/src/orders.ts`, `services.ts`, `errors.ts`, `index.ts`                       | Order request, order with payment state, pickers, cancel request; catalogue version; two codes |
| `packages/mod-billing/src/infrastructure/invoice.repository.ts`, `index.ts`                      | `findLineStates`                                                                               |
| `packages/mod-clinical/src/infrastructure/service-order.repository.ts`                           | Insert, list by visit (placement order), find, mark cancelled                                  |
| `packages/mod-clinical/src/application/order-placement.ts`, `order-views.ts`, `order.service.ts` | Placing with charges; the screen's view; use cases                                             |
| `packages/mod-clinical/src/http/orders.controller.ts`, `clinical.module.ts`                      | The routes                                                                                     |
| `packages/i18n/src/messages/*`                                                                   | `orders.*`; the two error messages                                                             |
| `apps/api/src/orders.api.spec.ts`                                                                | HTTP integration tests against PostgreSQL                                                      |
| `apps/web/src/components/orders/*`, `src/api/orders.ts`, consultation page                       | Picker, entry, list, consultation panel, rules (+ test), labels                                |
| `apps/web/e2e/orders.spec.ts`, `support/mock-orders.ts`, `support/mock-api.ts`                   | Browser tests and their contract-valid mock                                                    |

## Decisions applied

- **The order never writes invoice tables** (FR-ORD-003): it calls `postCharge`, keyed by the order (FPR-09: source `clinical/service_order/{id}/ORDERED`), and keeps the charge and line IDs.
- **Payment is not an order state** (FR-ORD-004): the list reads the line's eligibility and status from billing each time.
- **Only priced, active services can be ordered:** an item without a price in force is a field error on that item, and nothing of the request is kept.
- **The same service twice in one entry is one line;** ordering it again later is allowed (a repeat test).
- **Orders placed together** share their time; the list breaks the tie with their invoice line number, so the screen shows them in the order they were entered.
- **Only the consultation's doctor** lists and places its orders; another doctor gets NOT_FOUND, as for the note.

## Verification

| Command                                                                                                             | Result                                 |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `pnpm db:deploy` (local Docker)                                                                                     | `20261119100000_service_order` applied |
| `vitest run src/orders.api.spec.ts src/worklist.api.spec.ts src/prescriptions.api.spec.ts src/check-in.api.spec.ts` | 35 of 35                               |
| `vitest run` (web; i18n)                                                                                            | 106 of 106; 31 of 31                   |
| `CI=1 playwright test e2e/orders.spec.ts e2e/worklist.spec.ts e2e/prescription.spec.ts`                             | 11 of 11 on the production build       |
| `pnpm turbo run build lint typecheck`                                                                               | Green                                  |

Two defects were found and fixed while testing:

- A schema edit had placed the new Tenant relation in `Facility`, and `prisma format` then added a `facilityId` to `ServiceOrder`. The stray lines were removed.
- The list order of orders placed together was random; it now follows the invoice line number.

## Known limitations

- **No reception direct orders or walk-in visits yet** (T-VIS-02) and **no cancellation** (T-ORD-03): the next commits.
- **No order slip print** and no expected report time on the receipt yet (FR-ORD-007 print part, T-PRN-02).
- **Fulfilment stays REQUESTED:** IN_PROGRESS and COMPLETED come with the lab and imaging epics.
- **The Bangla texts** need the native-speaker review (A1, Q-050).

Deploy impact: migration `20261119100000_service_order` (new table, RLS, grants; expand-only). Two new error codes in the contract. No new variable, service or origin.

## How to debug

- **"No service with a price found":** the service is inactive or the price list in force has no price for it (part 1).
- **The order shows "Not paid" after paying the doctor fee:** expected; orders are on the SERVICE invoice and are paid separately (FR-ORD-005).
- **An order and its invoice line:** `service_order.invoice_line_id` and `charge_id`; the charge's source is `clinical/service_order/{order id}/ORDERED`.
