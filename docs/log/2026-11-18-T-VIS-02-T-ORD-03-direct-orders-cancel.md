# T-VIS-02 and T-ORD-03: direct diagnostic orders at reception, and order cancellation

- **Date:** 2026-11-18
- **Commit:** this commit
- **Implements:** T-VIS-02 (diagnostic path), T-ORD-03; UC-VIS-02, UC-ORD-02 (interim rule); FR-VIS-001, FR-ORD-001, FR-ORD-006, FR-BIL-009, FR-BIL-020, FR-BIL-031, FR-BIL-034; C-006; Q-017 interim; SP-01, SP-03; FR-AUD-001

## What was built

**Direct orders at reception (T-VIS-02).** The patient page of the front desk has a "Tests and services" section for staff with `visit.create` and `order.direct_diagnostic.create`:

- **Entry:** reception picks directly orderable tests one after another, with the same entry as the doctor, and places them.
- **One transaction:** `POST /visits/diagnostic` opens a DIAGNOSTIC visit (no doctor, no session, no doctor fee) and one order per test (source RECEPTION_DIRECT). Each test is a line on the visit's service invoice, which the cashier collects.
- **The picker:** offers only directly orderable services. A request with another is `TEST_NOT_DIRECTLY_ORDERABLE`, and nothing is kept: no visit, no order (FR-ORD-001, tested).
- **The list:** `GET /visits/orders?patientId=` shows the patient's orders in open visits, diagnostic and consultation ones alike, with their payment state.

**Cancelling an order (T-ORD-03).** Staff with `order.service.cancel` (doctor, reception) cancel an order from the doctor's Orders list or reception's list, with a mandatory reason:

- **Rule:** only while the order is REQUESTED and its invoice line has nothing paid (FR-ORD-006 interim).
- **One transaction:** billing cancels the line, which stays on the invoice as CANCELLED, and the service invoice total drops by its amount. The order becomes CANCELLED with its reason, time and user. Events: `InvoiceLineCancelled` and `OrderCancelled`, with audit.
- **Refused:** a paid line, or work already started, is `FEATURE_NOT_AVAILABLE` until Q-017 defines stages, approvals and reversal, and nothing changes (UC-ORD-02 D1, tested). A second cancel is INVALID_TRANSITION; a stale version is STALE_RECORD.

## Files

| File                                                                                                                                                    | Purpose                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/contracts/src/visits.ts`                                                                                                                      | Diagnostic visit request and answer; patient orders query                          |
| `packages/mod-clinical/src/infrastructure/visit.repository.ts`, `service-order.repository.ts`                                                           | Diagnostic visit insert, open visits of a patient; orders of several visits        |
| `packages/mod-clinical/src/application/direct-order.service.ts`, `http/direct-orders.controller.ts`                                                     | `POST /visits/diagnostic`, `GET /visits/orders`                                    |
| `packages/mod-clinical/src/domain/service-order.ts` (+ spec)                                                                                            | `assertCancellable`                                                                |
| `packages/mod-clinical/src/application/order-cancellation.service.ts`, `http/orders.controller.ts`                                                      | `POST /orders/{id}/cancel`                                                         |
| `packages/mod-billing/src/application/line-cancellation.ts`, `index.ts`                                                                                 | `cancelUnpaidLine`, under the invoice lock payments use                            |
| `apps/api/src/orders.api.spec.ts`                                                                                                                       | Four more HTTP tests                                                               |
| `apps/web/src/components/orders/patient-orders.tsx`, `cancel-order.tsx`, `consultation-orders.tsx`, `order-list.tsx`, `src/api/orders.ts`, patient page | Reception section; cancel action and dialog for both screens                       |
| `packages/i18n/src/messages/*`                                                                                                                          | `orders.direct*`, `orders.cancel*`                                                 |
| `apps/web/e2e/direct-orders.spec.ts`, `support/mock-orders.ts`; `e2e/orders.spec.ts`                                                                    | Browser tests; the mock answers the new routes; the orders spec is now plain ASCII |

## Decisions applied

- **One request opens the visit and places the orders,** so a refused test leaves no empty diagnostic visit behind.
- **Walk-in OPD is not a new path:** reception books the patient into today's session and checks them in, which gives the queue number and the doctor fee as UC-VIS-02 asks. The diagnostic path is the new one.
- **`TEST_NOT_DIRECTLY_ORDERABLE` is its own error code (422),** not PERMISSION_DENIED with a reason as UC-VIS-02 words it: the screens map codes to messages, and the item path names the test.
- **Both codes are needed for a diagnostic visit** (`visit.create` and `order.direct_diagnostic.create`), as UC-VIS-02 states (tested).
- **Billing owns the line cancellation:** clinical calls `cancelUnpaidLine`; it locks the invoice like a payment does (FR-BIL-034), reads the line again, and refuses a line with any allocation. The order's version check and the order status check make a second cancel safe.

## Verification

| Command                                                                                                           | Result                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `vitest run src/orders.api.spec.ts` (api, real PostgreSQL)                                                        | 9 of 9                                                                                     |
| `vitest run` (mod-clinical; web; i18n)                                                                            | 23 of 23; 106 of 106; 31 of 31                                                             |
| `CI=1 playwright test e2e/direct-orders.spec.ts e2e/orders.spec.ts e2e/patients.spec.ts e2e/appointments.spec.ts` | All pass on the production build, after replacing a button selector that matched any digit |
| `pnpm turbo run build lint typecheck`                                                                             | Green                                                                                      |
| `pnpm turbo run test --concurrency=1 --force` (2026-11-19, no cache)                                              | 35 of 35 tasks, 0 failed (api 261, web 106, mod-clinical 23, mod-billing 23), 10 min 18 s  |

## Known limitations

- **No order slip** with the expected report time, and the receipt does not show it yet (FR-ORD-007 print part, T-PRN-02).
- **No cancellation after payment or after work started** (Q-017). Refunds are Q-021.
- **Reception sees orders of open visits only;** visits are not completed or closed yet (FR-VIS-003), so the list grows over the day.
- **The Bangla texts** need the native-speaker review (A1, Q-050).

Deploy impact: none beyond part 2 (no new migration; new routes only).

## How to debug

- **`TEST_NOT_DIRECTLY_ORDERABLE`:** the service is not marked "Reception may order it" on the Services screen.
- **`FEATURE_NOT_AVAILABLE` on cancel:** the line has a payment, or the order is past REQUESTED. Check `invoice_line.allocated_amount` and `service_order.status`.
- **The service invoice total looks wrong after a cancel:** the total is the sum of ACTIVE lines (FR-BIL-031); a cancelled line keeps its amount but no longer counts.
