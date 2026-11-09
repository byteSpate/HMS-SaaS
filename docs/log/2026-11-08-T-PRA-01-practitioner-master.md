# T-PRA-01: practitioner master

- **Date:** 2026-11-08
- **Commit:** this commit
- **Implements:** T-PRA-01; FR-PRA-001, FR-PRA-002, FR-PRA-003; AT-PRA-001; SP-03; FR-AUD-001; ADR-003

## What was built

A hospital administrator can list, add and edit the hospital's practitioners at `/staff/admin/practitioners` (menu "Practitioners", needs `practitioner.manage`). A practitioner has a name in Bangla and/or English, degrees, specialty, contact number and an optional registration number; two practitioners may share a name. An edit sends the whole record with the version the screen showed, so a lost update is refused (`STALE_RECORD`), and a practitioner is deactivated, never deleted. Every change writes an audit event and a `PractitionerChanged` outbox event in the same transaction.

Riding along: the dev seed can now create the demo hospital on a shared database (Supabase) with passwords from `SEED_ADMIN_PASSWORD` and `SEED_RECEPTION_PASSWORD`, never the public dev ones, and DEPLOYMENT.md records the Supabase work done on 2026-11-08.

## Files

| File                                                                                     | Purpose                                                                      |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261108090000_practitioner/migration.sql`          | `hms.practitioner` with name and blank-text CHECKs, RLS, column UPDATE grant |
| `packages/database/prisma/schema.prisma`                                                 | `Practitioner` model and the tenant relation                                 |
| `packages/contracts/src/practitioners.ts`                                                | Create, update, item and list schemas shared by API and web                  |
| `packages/mod-patients/src/domain/practitioner.ts`                                       | Text tidying (NFC, spaces) and the changed-field list                        |
| `packages/mod-patients/src/infrastructure/practitioner.repository.ts`                    | List, find, insert, version-checked update                                   |
| `packages/mod-patients/src/application/practitioner.service.ts`                          | Use cases with audit and outbox in one transaction                           |
| `packages/mod-patients/src/http/practitioners.controller.ts`                             | `GET/POST /practitioners`, `GET/PUT /practitioners/{id}`                     |
| `packages/mod-patients/src/patients.module.ts`                                           | Registers the controller and service                                         |
| `apps/web/app/(app)/admin/practitioners/page.tsx`                                        | Practitioners table                                                          |
| `apps/web/src/components/practitioners/practitioner-dialog.tsx`, `-form.ts`              | Add/edit dialog and its pure form rules                                      |
| `apps/web/src/api/practitioners.ts`, `apps/web/src/navigation.ts`                        | API client; menu entry                                                       |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                           | `nav.practitioners` and the `practitioners` texts                            |
| `apps/api/src/practitioners.api.spec.ts`                                                 | HTTP integration tests against PostgreSQL                                    |
| `packages/mod-patients/src/domain/practitioner.spec.ts`, `.../practitioner-form.test.ts` | Unit tests                                                                   |
| `apps/web/e2e/practitioners.spec.ts`, `apps/web/e2e/support/mock-practitioners.ts`       | Browser tests and their contract-valid mock                                  |
| `apps/api/scripts/seed-dev.ts`, `README.md`                                              | Seed on a shared database with your own passwords                            |
| `docs/DEPLOYMENT.md`                                                                     | pg_trgm marked done on Supabase; Supabase ahead of `main` recorded           |

## Decisions applied

- **No department and no user link yet** (owner decision 2026-11-08, option A): departments have no screen or API, so the field waits for a departments task; FR-PRA-003's user link waits for a use. Unknown fields are refused, so adding them later is explicit.
- **The table lives in mod-patients** as E section 4 assigns it; the routes are `/practitioners`.
- **FR-PRA-001:** no uniqueness on name or registration number; a name in at least one script is a CHECK and a contract rule.
- **FR-PRA-002:** lists read the table directly, so a saved practitioner is in every list on the next request; the web invalidates its `['practitioners']` query on save. `PractitionerChanged` in the outbox is there for a picker cache later.
- **SP-03:** whole-record PUT with `expectedVersion`; the update matches on the version, so a concurrent edit gets `STALE_RECORD`. An edit that changes nothing is `VALIDATION_FAILED`.
- **No delete:** `hms_app` has no DELETE and may UPDATE only the editable columns; `created_by` and `created_at` never change (tested).
- **Seed on a shared database:** only with `SEED_*_PASSWORD` of 12+ characters that are not the dev passwords; the passwords are never printed. A stop-gap until T-SAA-01 provisions tenants.

## Verification

| Command                                                                          | Result                                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm db:deploy` (local Docker)                                                  | `20261108090000_practitioner` applied                      |
| `vitest run src/domain/practitioner.spec.ts` (mod-patients)                      | 4 of 4                                                     |
| `vitest run src/practitioners.api.spec.ts` (api, real PostgreSQL)                | 9 of 9                                                     |
| `vitest run src/components/practitioners` (web)                                  | 5 of 5                                                     |
| `playwright test e2e/practitioners.spec.ts` (next dev, axe check)                | 4 of 4                                                     |
| `pnpm boundaries:check`                                                          | No violations                                              |
| `pnpm turbo run build lint typecheck`                                            | Green after fixing two unused test variables               |
| `prettier --check` on every changed file                                         | Clean (see limitation on CRLF below)                       |
| Seed against Supabase without / with the dev password                            | Refused before connecting, as intended                     |
| `pnpm turbo run test` (all packages at once)                                     | Green except 3 `@hms/platform` tests timing out under load |
| `@hms/platform` alone, then `@hms/mod-identity-access`, `@hms/api` one at a time | 53, 81 and 145 passed                                      |

## Known limitations

- **No department, no user-account link** (above). No search or paging on the list: a hospital has tens of doctors, not thousands.
- **No picker route for scheduling yet:** `GET /practitioners` needs `practitioner.manage`; T-SCH-01 adds a read of active practitioners for the scheduling permissions.
- **The Bangla texts** need the native-speaker review owed for RG-1.
- **The phone is stored as typed,** not normalized like a patient's mobile number; it is contact detail, never a search key.
- **Locally `pnpm format:check` reports about 500 files** on a Windows clone with `core.autocrlf=true`: the files are CRLF in the working copy and LF in the repository. CI checks LF and is not affected; check changed files with `prettier --check <files>`.

Deploy impact: migration `20261108090000_practitioner` (new table, RLS, column grants; expand-only, safe while the previous version runs). No new variable for the API. `SEED_ADMIN_PASSWORD` and `SEED_RECEPTION_PASSWORD` are optional and only for `pnpm db:seed:dev` against a shared database.

## How to debug

- **The menu entry is missing:** the session's `permissions` lack `practitioner.manage` (the ADM template has it; a hospital seeded before T-ACC-02 templates may not).
- **`ENTITLEMENT_MISSING`:** the hospital lacks the `patients` module (`tenant_entitlement`).
- **`STALE_RECORD` on every save:** the dialog is older than the row; it reopens with the new version after "Reload".
- **"permission denied for table practitioner":** the migration's column grant is missing on that database; compare `\dp hms.practitioner` with the migration.
