# T-ORD-02: the payment gate and the department worklist

- **Date:** 2026-11-19
- **Commit:** this commit
- **Implements:** T-ORD-02; FR-BIL-003, FR-LAB-004, FR-ORD-004, FR-ORD-005, FR-RIS-002; UC-BIL-02 "Gate"; C-011, C-040, C-100 (new); D section 14.2; SP-01, SP-03; FR-AUD-001

## What was built

**Billing's payment check (`assertEligible`).** Other modules call `assertEligible(tx, lineIds)` from `@hms/mod-billing` inside their own transaction, before they start a service:

- **Rule:** every line must be ACTIVE and fully paid (CP-02 = `FULL_PAYMENT`, C-040). Deposits stay disabled (Q-004), exceptions too (Q-005).
- **Refusal:** `PAYMENT_NOT_ELIGIBLE` (409) with `lines: [{ lineId, invoiceNumber, due }]`, so the screen can say what is due on which invoice. A cancelled line is `INVALID_TRANSITION`.
- **Locking:** the lines are read `FOR SHARE` in ID order (D section 14.2). A cancellation of the same line waits for the department's commit; two departments never deadlock.

**Starting an order.** `POST /orders/{id}/start` (`order.service.start`, Idempotency-Key, `expectedVersion`) moves a REQUESTED order to IN_PROGRESS after the check passes, in one transaction, audited as `OrderStarted`. A started order cannot be started again (`INVALID_TRANSITION`) and cannot be cancelled (`FEATURE_NOT_AVAILABLE`, T-ORD-03).

**The department worklist.** `GET /orders/worklist?category=` lists today's (Asia/Dhaka) REQUESTED and IN_PROGRESS orders, urgent first, with the patient and the payment state. The new screen at `/staff/department` ("Department worklist", Clinical menu) shows three parts:

- **Ready to start:** paid orders, each with a Start button.
- **In progress.**
- **Awaiting payment:** unpaid orders with the amount still due, and a hint to send the patient to the cashier.

The list polls every 20 seconds while visible (ADR-015) and has a category filter. A refused start names the amount and the invoice.

**`due` on every order.** The order's payment state now carries `due`, computed by billing with Money (0.00 once paid or when the line is cancelled), because the web app may not do money arithmetic (D section 5 rule 2).

## Files

| File                                                                                                               | Purpose                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `packages/mod-billing/src/domain/eligibility.ts` (+ spec)                                                          | `checkEligible`, the pure rule                                                        |
| `packages/mod-billing/src/application/eligibility.ts`, `index.ts`                                                  | `assertEligible`, lines `FOR SHARE`                                                   |
| `packages/mod-billing/src/infrastructure/invoice.repository.ts`                                                    | `due` in `findLineStates`                                                             |
| `packages/mod-clinical/src/domain/service-order.ts` (+ spec)                                                       | `assertStartable`; shared version check                                               |
| `packages/mod-clinical/src/infrastructure/service-order.repository.ts`                                             | `listDepartmentOrders`, `markStarted`                                                 |
| `packages/mod-clinical/src/application/order-start.service.ts`, `department-worklist.service.ts`, `order-views.ts` | Start command, worklist read, `due` in the view                                       |
| `packages/mod-clinical/src/http/department-orders.controller.ts`, `clinical.module.ts`                             | The two routes                                                                        |
| `packages/contracts/src/orders.ts`, `errors.ts`, `permissions.ts`                                                  | Start request, worklist schemas, `due`; `lines` on the problem; `order.service.start` |
| `packages/authz/src/role-templates.ts`                                                                             | `order.service.start` for LBT (and LBA)                                               |
| `packages/i18n/src/messages/*`                                                                                     | `nav.department`, `department.*`                                                      |
| `apps/web/app/(app)/department/page.tsx`, `src/components/department/*`, `src/api/orders.ts`, `src/navigation.ts`  | The screen, its table and split rule (+ test), client calls, menu entry               |
| `apps/api/src/orders.api.spec.ts`                                                                                  | Four HTTP tests; `payLine` can pay part of a line                                     |
| `apps/web/e2e/department.spec.ts`, `support/mock-orders.ts`; `src/components/orders/order-rules.test.ts`           | Browser tests; the mock answers the new routes and carries `due`                      |
| `docs/planning/docs/A2-decision-register.md`, `C-srs/C00-srs-overview.md`                                          | C-100 and the permission row                                                          |
| `docs/DEPLOYMENT.md`, `docs/log/2026-11-18-T-ORD-01-service-catalogue.md`                                          | The 2026-11-19 Supabase migration (39) recorded                                       |

## Decisions applied

- **A department worklist before the lab exists (C-100, product owner 2026-11-19).** The gate needs a caller users can try; T-LAB-02 is blocked on Q-011. The lab's collect command will call the same `assertEligible`.
- **`order.service.start` is a new code**, not `lab.specimen.collect`: imaging and procedures start orders too. Default template LBT (LBA includes it).
- **The check runs on the server at the moment of starting** (FR-BIL-003); the screen's split is only layout, and a stale "ready" row is refused with the amount due.
- **`due` comes from the server** instead of being computed in the browser (ADR-007, D section 5 rule 2).
- **No migration:** `service_order.status` already allows IN_PROGRESS and `hms_app` may update it. Who started an order and when is in the audit event.

## Verification

| Command                                                                                    | Result                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest run src/domain/eligibility.spec.ts` (mod-billing)                                  | 5 of 5                                                                                                                                        |
| `vitest run src/domain/service-order.spec.ts` (mod-clinical)                               | 5 of 5                                                                                                                                        |
| `vitest run src/orders.api.spec.ts` (api, real PostgreSQL)                                 | 13 of 13 (4 new)                                                                                                                              |
| `vitest run src/components/department src/components/orders` (web)                         | 9 of 9                                                                                                                                        |
| `CI=1 playwright test e2e/department.spec.ts e2e/orders.spec.ts e2e/direct-orders.spec.ts` | 8 of 8 on the production build (3 new)                                                                                                        |
| `pnpm turbo run build lint typecheck --concurrency=1`                                      | 58 of 58                                                                                                                                      |
| `pnpm boundaries:check`, `prettier --check` on changed files, plain-ASCII check            | Clean                                                                                                                                         |
| `pnpm turbo run test --concurrency=1 --force`                                              | 35 of 35 tasks (api 265, web 108, mod-billing 28, mod-clinical 26), after one run of `outbox.spec.ts` alone to drain the local outbox backlog |

## Known limitations

- **No "complete" step yet:** an order stays IN_PROGRESS until the lab (T-LAB-04..06) or radiology records a result.
- **Existing hospitals' roles do not get `order.service.start`:** templates are copied when a hospital is created. An administrator adds the code on the Roles screen (local demo and Supabase demo included).
- **The worklist shows today's orders only;** an order left REQUESTED from an earlier day drops off it (visits are not closed yet, FR-VIS-003).
- **No emergency override** (`billing.eligibility.override`, Q-005) and no deposits (Q-004).
- **The Bangla texts** need the native-speaker review (A1, Q-050).

Deploy impact: no migration, no new variable, service or origin. New permission code `order.service.start`; grant it to the lab roles of existing hospitals on the Roles screen.

## How to debug

- **`PAYMENT_NOT_ELIGIBLE` on Start:** the line's `allocated_amount` is below `net_amount`. The answer's `lines[].due` says how much; the cashier takes it on the service invoice.
- **The menu has no "Department worklist":** the role lacks `order.service.start` (see Known limitations).
- **An order is missing from the worklist:** it was placed before today in Asia/Dhaka, or it is CANCELLED or COMPLETED.
- **A start waits:** another transaction holds the invoice line (a cancellation or a payment of the same line); it continues once that commits.
