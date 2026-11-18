# T-CLI-03 (part 1): medicine catalogue and prescribing lists

- **Date:** 2026-11-18
- **Commit:** this commit
- **Implements:** T-CLI-03 (first part); FR-CLI-004 (catalogue-based lines), FR-PHA-011 (subset), FR-I18N-006, FR-CFG-001, FR-AUD-001; SP-03; ADR-003; Q-067 interim (catalogue-based lines with free-text instructions, vocabularies entered by the hospital)

## What was built

A hospital administrator keeps the medicine catalogue at `/staff/admin/medicines` and the prescribing lists at `/staff/admin/prescribing-lists` (menu "Medicines" and "Prescribing lists", both need `admin.config.publish`). A medicine has a brand, a generic name, a form, an optional strength, an optional Bangla brand name and an optional manufacturer. The same brand, strength and form twice in a hospital, in any letter case, is refused on the brand field. The prescribing lists hold the hospital's routes, frequencies and durations, each with a Bangla and/or English label and a picker order. A label missing in one language is marked. Entries are deactivated, never deleted, and every change writes an audit event and an outbox event (`MedicineChanged`, `PrescribingTermChanged`).

Doctors get two read routes for the prescription form (part 2): `GET /prescribing/medicines?q=` finds active medicines by brand or generic name (at most 20), and `GET /prescribing/terms` lists the active terms of each kind in picker order. Both need `clinical.prescription.create`, so a doctor does not need the right to manage the catalogue.

This is the first part of T-CLI-03. The prescription itself (lines, fulfilment choice, sign and amend) and its print follow in the next commits.

## Files

| File                                                                                  | Purpose                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261118090000_medicine_catalogue/migration.sql` | `medicine`, `prescribing_term`: CHECKs, case-insensitive identity index, RLS, column grants |
| `packages/database/prisma/schema.prisma`                                              | `Medicine`, `PrescribingTerm` models                                                        |
| `packages/contracts/src/medicines.ts`, `index.ts`                                     | Medicine and term create, update, record, list, choice and search schemas                   |
| `packages/mod-pharmacy/*` (new package)                                               | Module, domain values (+ spec), repositories, services, controllers                         |
| `packages/mod-pharmacy/src/index.ts`                                                  | Public entry: the module and the two lookups the prescription will use                      |
| `apps/api/src/app.module.ts`, `apps/api/package.json`                                 | Registers `PharmacyModule`                                                                  |
| `apps/api/src/medicines.api.spec.ts`                                                  | HTTP integration tests against PostgreSQL                                                   |
| `apps/web/app/(app)/admin/medicines/page.tsx`, `prescribing-lists/page.tsx`           | The two admin screens                                                                       |
| `apps/web/src/components/medicines/*`                                                 | Dialogs, pure form rules (+ test), kind labels                                              |
| `apps/web/src/api/medicines.ts`, `apps/web/src/navigation.ts`                         | API client (admin and picker routes); two menu entries                                      |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                        | `nav.medicines`, `nav.prescribingLists`, `medicines.*`, `prescribingTerms.*`                |
| `apps/web/e2e/medicines.spec.ts`, `support/mock-medicines.ts`, `support/mock-api.ts`  | Browser tests and their contract-valid mock (also answers the picker routes)                |

## Decisions applied

- **A new `mod-pharmacy` package owns the catalogue** (owner choice 2026-11-18; E section 2 gives `medicine` to mod-pharmacy). It holds only the prescribing catalogue for now; stock items, batches, packs and suppliers (FR-PHA-011 in full, Q-014) extend these rows in Phase 4.
- **Hospital lists for route, frequency and duration; dose and instructions stay free text** (owner choice 2026-11-18, Q-067 interim). A prescription line will keep a copy of the labels it was written with, so editing or deactivating a term never changes a signed prescription.
- **Permission `admin.config.publish`** for the admin routes, like departments: the catalogue is hospital configuration, and no new permission code is needed. The doctor's read routes use `clinical.prescription.create`.
- **Identity of a medicine:** brand, strength and form, compared in lower case. The service checks first, so the administrator gets a field error on `brandName`; the `medicine_identity_key` expression index is the last guard, and a race that reaches it is still answered as the same field error.
- **SP-03:** whole-record PUT with `expectedVersion`; an edit that changes nothing is `VALIDATION_FAILED`. The kind of a term is not part of an edit (strict schema), and `hms_app` cannot update it, `created_*` or `tenant_id`, nor delete any row (tested).
- **No Idempotency-Key** on the admin routes, as for departments: a repeated medicine is refused by the identity rule; a repeated term is visible in the list and harmless.

## Verification

| Command                                                              | Result                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` (local Docker)                                      | `20261118090000_medicine_catalogue` applied                                                                                                                                               |
| `vitest run src/medicines.api.spec.ts` (api, real PostgreSQL)        | 8 of 8                                                                                                                                                                                    |
| `vitest run` (mod-pharmacy)                                          | 3 of 3                                                                                                                                                                                    |
| `vitest run src/components/medicines` (web)                          | 6 of 6                                                                                                                                                                                    |
| `vitest run` (i18n: catalog parity and unused keys)                  | 31 of 31                                                                                                                                                                                  |
| `playwright test e2e/medicines.spec.ts` under `next dev`             | axe "region" on the skip link, the known dev-only issue (T-UI-03)                                                                                                                         |
| `CI=1 playwright test e2e/medicines.spec.ts e2e/departments.spec.ts` | 9 of 9 on the production build                                                                                                                                                            |
| `pnpm turbo run build lint typecheck`                                | 58 of 58 green after one sonarjs fix in the contract                                                                                                                                      |
| `pnpm boundaries:check`                                              | No violations (929 modules)                                                                                                                                                               |
| `prettier --check` on every changed file                             | Clean (the full `format:check` shows the known CRLF noise only)                                                                                                                           |
| `pnpm turbo run test --concurrency=1`                                | 35 of 35 test tasks (api 247 of 247) on the second run; the first stopped on the outbox relay test, which timed out draining the day's backlog of test events and passes alone (11 of 11) |

## Known limitations

- **No prescription yet:** the next commit of T-CLI-03 adds it; the picker routes have no screen until then.
- **Strength and form are free text** until Q-067 settles generic/brand structure and units; packs and base units wait for Q-014.
- **No duplicate rule for terms:** two entries with the same label are allowed; the administrator sees both in the list.
- **The search is a plain `ILIKE` on brand and generic name** without a trigram index; enough for a hospital catalogue of a few thousand rows.
- **No seed catalogue:** each hospital enters its own (no clinical content ships with the product).
- **Supabase is behind:** the migration is applied locally only; `pnpm db:deploy` against Supabase applies it (expand-only).
- **The Bangla texts** need the native-speaker review (A1, Q-050).

Deploy impact: migration `20261118090000_medicine_catalogue` (two new tables, expand-only); new workspace package `@hms/mod-pharmacy` built with the API. No new variable, service or origin.

## How to debug

- **The menu entries are missing:** the session's `permissions` lack `admin.config.publish`.
- **`VALIDATION_FAILED` on `brandName` for a "new" medicine:** an entry with the same brand, strength and form exists, maybe inactive; edit and reactivate it instead.
- **The doctor's search finds nothing:** the medicine is inactive, or the doctor's hospital differs (RLS). `403` means the role lacks `clinical.prescription.create`; `ENTITLEMENT_MISSING` means the hospital has no `clinical` module.
