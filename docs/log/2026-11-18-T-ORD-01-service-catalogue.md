# T-ORD-01 (part 1): service catalogue and service prices

- **Date:** 2026-11-18
- **Commit:** this commit
- **Implements:** T-ORD-01 (first part); FR-ORD-001 (directly orderable flag), FR-ORD-007 (expected report time), FR-CFG-001, FR-CFG-002, FR-BIL-007, FR-I18N-006, FR-AUD-001; SP-03; C-008, C-041

## What was built

Staff who keep the price list (`admin.price.publish`) now keep the hospital's orderable services at `/staff/admin/services` (menu "Services"). Each service has:

- a code (upper case, unique among all items), fixed once saved
- a category (laboratory, imaging, procedure, other), fixed once saved
- a name in Bangla and/or English
- whether reception may order it without a doctor (CP-01)
- the expected hours to the report, for receipts and order slips

The price list screen (menu "Price list", formerly "Doctor fees") now holds service prices next to doctor fees. Services are priced in the draft, the publish preview lists service price changes, and a published version prices orders from its effective time.

For the order screens, billing exports `orderableServicesInForce`: the active services that have a price in the version in force, found by text or by ID, optionally only the directly orderable ones.

## Files

| File                                                                                                                  | Purpose                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261119090000_service_catalogue/migration.sql`                                  | `service_item` gets `directly_orderable`, `report_hours`, `updated_at`, `version`, name CHECK; one service price per version; column grants |
| `packages/database/prisma/schema.prisma`                                                                              | The new `ServiceItem` columns                                                                                                               |
| `packages/contracts/src/services.ts`, `price-lists.ts`, `index.ts`                                                    | Service schemas, orderable service; service prices, counts and changes in the price list                                                    |
| `packages/mod-billing/src/infrastructure/service-item.repository.ts`                                                  | Catalogue rows, choices, orderable search with the price in a version                                                                       |
| `packages/mod-billing/src/infrastructure/price-list.repository.ts`                                                    | Service prices per version, write and remove, counts                                                                                        |
| `packages/mod-billing/src/domain/price-list.ts` (+ spec)                                                              | `diffServicePrices`                                                                                                                         |
| `packages/mod-billing/src/application/service-catalogue.service.ts`, `orderable-services.ts`, `price-list.service.ts` | Catalogue use cases; the export for orders; service prices in the price list                                                                |
| `packages/mod-billing/src/http/services.controller.ts`, `price-lists.controller.ts`, `billing.module.ts`, `index.ts`  | `GET/POST /billing/services`, `PUT /billing/services/{id}`; `PUT .../service-prices/{id}` and `POST .../remove`                             |
| `apps/api/src/services.api.spec.ts`                                                                                   | HTTP integration tests against PostgreSQL                                                                                                   |
| `apps/web/app/(app)/admin/services/page.tsx`, `src/components/services/*`, `src/api/services.ts`                      | Services screen, dialog, form rules (+ test), category labels                                                                               |
| `apps/web/src/components/services/service-prices.tsx`, `doctor-fees/*`, `src/api/price-lists.ts`                      | Service prices in the draft and in force; changes in the publish preview                                                                    |
| `apps/web/src/navigation.ts`, `packages/i18n/src/messages/*`                                                          | "Services" menu entry; "Price list" title; `services.*`, `servicePrices.*`                                                                  |
| `apps/web/e2e/services.spec.ts`, `support/mock-services.ts`, `support/mock-price-lists.ts`, `support/mock-api.ts`     | Browser tests and their contract-valid mocks                                                                                                |

## Decisions applied

- **Billing's catalogue holds the orderable services** (owner choice 2026-11-18). T-BIL-01 created `service_item` for doctor fees; adding services there keeps one catalogue and one price list. Doctor-fee items (CONSULTATION) are system items and never appear on the Services screen, and no service can be created in CONSULTATION, MEDICINE or BED.
- **Code and category never change:** the category decides the invoice a charge goes on (C-008), so `hms_app` has no UPDATE on them.
- **One price per service and version:** NULL practitioners are distinct in the old unique index, so a partial unique index covers service prices. A price is more than 0.00 (C-041).
- **Permission `admin.price.publish`** for the catalogue as well as the prices: the staff who price services (ADM, FIN) also keep the list. No new permission code.
- **A service without a price in force cannot be ordered:** `orderableServicesInForce` returns only priced services, since the order's charge would be refused (FR-BIL-007).

## Verification

| Command                                                                                                             | Result                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm db:deploy` (local Docker)                                                                                     | `20261119090000_service_catalogue` applied                 |
| `vitest run src/services.api.spec.ts src/price-lists.api.spec.ts src/check-in.api.spec.ts src/payments.api.spec.ts` | 25 of 25                                                   |
| `vitest run` (mod-billing)                                                                                          | 23 of 23                                                   |
| `vitest run` (web)                                                                                                  | 104 of 104                                                 |
| `CI=1 playwright test e2e/services.spec.ts e2e/doctor-fees.spec.ts`                                                 | 4 of 4, after stripping `servicePrices` from the mock list |
| `pnpm turbo run build lint typecheck` (billing, contracts, web)                                                     | Green                                                      |

## Known limitations

- **No orders yet:** the next commits add doctor orders, reception direct orders with walk-in visits, and cancellation.
- **No seed catalogue:** each hospital enters its own services and prices.
- **The search is a plain `ILIKE`** on code and names.
- **Supabase:** the migration is local only until the orders PR merges.
- **The Bangla texts** need the native-speaker review (A1, Q-050).

Deploy impact: migration `20261119090000_service_catalogue` (new columns with defaults, CHECKs, a partial unique index, a column grant; expand-only). No new variable, service or origin.

## How to debug

- **A service is missing from an order picker:** it is inactive, has no price in the version in force, or (at reception) is not directly orderable.
- **`VALIDATION_FAILED` on `code`:** another item of the hospital has the code, a doctor-fee item included.
- **The draft shows no services to price:** every active service already has a price in the draft, or none is active.
