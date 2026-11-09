# T-PRA-02: department master

- **Date:** 2026-11-09
- **Commit:** this commit
- **Implements:** T-PRA-02 (new task, owner decision 2026-11-09); FR-CFG-001, FR-I18N-006; SP-03; FR-AUD-001; C-024; ADR-003

## What was built

A hospital administrator can list, add, edit and deactivate the hospital's departments at `/staff/admin/departments` (menu "Departments", needs `admin.config.publish`). A department has a short code (MED, OBG), unique in the hospital and stored upper case, and a name in Bangla and/or English. The list marks a missing Bangla or English name (FR-I18N-006). An edit sends the whole record with the version the screen showed, so a lost update is refused (`STALE_RECORD`); a department is deactivated, never deleted. Every change writes an audit event and a `DepartmentChanged` outbox event in the same transaction.

This is the first part of T-PRA-02. The optional department on practitioners follows in the next commit, and schedules (T-SCH-01) take it from there.

Riding along: the NFC and space tidying of master text moved to `tidyText` in `@hms/domain-kernel`, used by practitioners, patient names and departments instead of two copies.

## Files

| File                                                                                                                                   | Purpose                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261109090000_department_master/migration.sql`                                                   | Active flag, created/updated columns, version, code and name CHECKs, grant |
| `packages/database/prisma/schema.prisma`                                                                                               | The new `Department` columns                                               |
| `packages/contracts/src/departments.ts`                                                                                                | Create, update, record and list schemas (`DepartmentRecord`)               |
| `packages/domain-kernel/src/text.ts`                                                                                                   | `tidyText`, shared by every master and patient name                        |
| `packages/mod-identity-access/src/domain/department.ts`                                                                                | Department values and the changed-field list                               |
| `packages/mod-identity-access/src/infrastructure/department.repository.ts`                                                             | List, find, code check, insert, version-checked update; the main facility  |
| `packages/mod-identity-access/src/application/department-admin.service.ts`                                                             | Use cases with audit and outbox in one transaction                         |
| `packages/mod-identity-access/src/http/department-admin.controller.ts`                                                                 | `GET/POST /admin/departments`, `GET/PUT /admin/departments/{id}`           |
| `packages/mod-identity-access/src/identity-access.module.ts`, `http/admin-request.ts`                                                  | Registration; `idPipe('Department')`                                       |
| `packages/mod-patients/src/domain/practitioner.ts`, `patient-identity.ts`                                                              | Use `tidyText` from the kernel                                             |
| `apps/web/app/(app)/admin/departments/page.tsx`                                                                                        | Departments table with the missing-name marker                             |
| `apps/web/src/components/departments/department-dialog.tsx`, `-form.ts`                                                                | Add/edit dialog and its pure form rules                                    |
| `apps/web/src/api/departments.ts`, `apps/web/src/navigation.ts`                                                                        | API client; menu entry                                                     |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                                                         | `nav.departments` and the `departments` texts                              |
| `apps/api/src/departments.api.spec.ts`                                                                                                 | HTTP integration tests against PostgreSQL                                  |
| `packages/mod-identity-access/src/domain/department.spec.ts`, `.../department-form.test.ts`, `packages/domain-kernel/src/text.test.ts` | Unit tests                                                                 |
| `apps/web/e2e/departments.spec.ts`, `apps/web/e2e/support/mock-departments.ts`                                                         | Browser tests and their contract-valid mock                                |
| `packages/database/src/with-tenant.int.test.ts`                                                                                        | The composite-FK test row now passes the new NOT NULL and name rules       |
| `docs/planning/docs/G-implementation-plan.md`                                                                                          | T-PRA-02 row; T-SCH-01 depends on it                                       |

## Decisions applied

- **Departments before scheduling** (owner decision 2026-11-09): front desks work by department, and adding it before schedules and bookings exist avoids back-filling them later.
- **The table stays in mod-identity-access**, as E section 4 assigns it with tenant and facility; the routes are hospital administration, `/admin/departments`.
- **Permission `admin.config.publish`**, the configuration permission the ADM template already has; no new permission code, so roles copied before today keep working. Reception pickers get their own read route with T-SCH-01.
- **One facility per hospital (C-024):** the contract sends no facility. Provisioning does not create a facility yet (T-SAA-01), so the first department creates the hospital's `MAIN` facility (`INSERT ... ON CONFLICT DO NOTHING`, so two first saves do not make two).
- **Code:** 1-20 upper-case letters, digits or hyphens starting with a letter; a CHECK and a contract rule. Unique in the hospital, checked before writing so the administrator gets a field error on `code`; the `(tenant, facility, code)` unique index is the last guard.
- **FR-I18N-006:** a name in at least one script (CHECK and contract); the admin list shows "Bangla name missing" or "English name missing".
- **SP-03:** whole-record PUT with `expectedVersion`; the update matches on the version. An edit that changes nothing is `VALIDATION_FAILED`.
- **No delete:** `hms_app` has no DELETE and may UPDATE only code, names, active, `updated_*` and version; the facility and `created_*` never change (tested).
- **No Idempotency-Key:** the admin routes follow the role and user administration pattern; a repeated create is refused by the code rule.

## Verification

| Command                                                                    | Result                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm db:deploy` (local Docker)                                            | `20261109090000_department_master` applied                 |
| `vitest run src/departments.api.spec.ts` (api, real PostgreSQL)            | 9 of 9                                                     |
| `vitest run src/domain/department.spec.ts` (mod-identity-access)           | 2 of 2                                                     |
| `vitest run src/text.test.ts` (domain-kernel); `src/domain` (mod-patients) | 2 of 2; 37 of 37 after the move                            |
| `vitest run src/components/departments` (web)                              | 5 of 5                                                     |
| `playwright test e2e/departments.spec.ts` (next dev, axe check)            | 5 of 5 after matching the toast's first copy (live region) |
| `pnpm turbo run build lint typecheck`                                      | Green after splitting the dialog and mock for sonarjs      |
| `pnpm boundaries:check`                                                    | No violations                                              |
| `prettier --check` on every changed file                                   | Clean                                                      |
| `vitest run` (database)                                                    | 28 of 28 after fixing the composite-FK test row            |
| `pnpm turbo run test --concurrency=1`                                      | 26 of 26 test tasks green                                  |

## Known limitations

- **No department on practitioners yet:** the next commit of T-PRA-02 adds it.
- **No picker route:** `GET /admin/departments` needs `admin.config.publish`; T-SCH-01 adds a read of active departments for reception.
- **A race on the same new code** between two administrators passes the check in both and the second insert fails on the unique index with a server error instead of a field error. Rare for a master edited by one administrator.
- **Supabase is behind:** the migration is applied locally only. `pnpm db:deploy` against Supabase applies it (expand-only).
- **The Bangla texts** need the native-speaker review owed for RG-1.

Deploy impact: migration `20261109090000_department_master` (new columns with defaults or NOT NULL on an empty table, CHECKs, column grant; expand-only, safe while the previous version runs). No new variable.

## How to debug

- **The menu entry is missing:** the session's `permissions` lack `admin.config.publish` (the ADM template has it).
- **`VALIDATION_FAILED` on `code`:** another department of the hospital has the code, active or not; deactivated departments keep their code.
- **The migration fails with "column created_by contains null values":** that database has department rows written outside the app; give them a creator first.
- **"permission denied for table department":** the column grant is missing; compare `\dp hms.department` with the migration.
- **"permission denied for table facility" on the first department:** `hms_app` lacks INSERT on `hms.facility` (granted by the default privileges in the roles script).
