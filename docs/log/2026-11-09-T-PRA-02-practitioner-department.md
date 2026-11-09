# T-PRA-02 part 2: a practitioner's department

- **Date:** 2026-11-09
- **Commit:** this commit
- **Implements:** T-PRA-02 (second part); FR-PRA-001 (department), FR-CFG-001; SP-03; ADR-003

## What was built

A practitioner can now belong to one department of the hospital, or to none. The practitioner dialog has a department picker with the hospital's active departments, and the practitioners table has a Department column ("MED - Medicine"). The picker is `GET /practitioners/department-choices`, which needs only `practitioner.manage`: choosing a department does not need the right to manage departments (`admin.config.publish`). A changed department is audited like any other field (`changedFields` includes `departmentId`).

Also: Supabase now has every migration of this branch (practitioner, department master, practitioner department), applied on 2026-11-09 at the owner's request; DEPLOYMENT.md records it.

## Files

| File                                                                                                  | Purpose                                                                    |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261109100000_practitioner_department/migration.sql`            | `department_id`, composite FK to the hospital's department, index, grant   |
| `packages/database/prisma/schema.prisma`                                                              | `Practitioner.department` relation                                         |
| `packages/contracts/src/departments.ts`, `practitioners.ts`                                           | `departmentChoiceSchema` and its list; `departmentId` in, `department` out |
| `packages/mod-identity-access/src/infrastructure/department.repository.ts`, `index.ts`                | `listDepartmentChoices` and `isSelectableDepartment`, exported             |
| `packages/mod-patients/src/domain/practitioner.ts`                                                    | `departmentId` among the values and changed fields                         |
| `packages/mod-patients/src/infrastructure/practitioner.repository.ts`                                 | Reads the department; stored values for the change check                   |
| `packages/mod-patients/src/application/practitioner.service.ts`                                       | Department choices; an active department on create and on change           |
| `packages/mod-patients/src/http/practitioners.controller.ts`                                          | `GET /practitioners/department-choices`                                    |
| `apps/web/src/components/practitioners/practitioner-dialog.tsx`, `-form.ts`                           | Department picker; `departmentOptions` and `departmentLabel`               |
| `apps/web/app/(app)/admin/practitioners/page.tsx`, `apps/web/src/api/practitioners.ts`                | Department column; the choices request                                     |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                        | `practitioners.department`, `noDepartment`, `columnDepartment`             |
| `apps/api/src/practitioners.api.spec.ts`, `.../practitioner.spec.ts`, `.../practitioner-form.test.ts` | Department tests                                                           |
| `apps/web/e2e/practitioners.spec.ts`, `apps/web/e2e/support/mock-practitioners.ts`                    | Picks a department in the browser; the mock answers the choices route      |
| `docs/DEPLOYMENT.md`                                                                                  | Supabase migrated up to this migration                                     |

## Decisions applied

- **Optional:** a visiting consultant may have no department; `null` is "none".
- **Only this module reads departments:** mod-patients calls `listDepartmentChoices` and `isSelectableDepartment` from `@hms/mod-identity-access`, the module that owns the table (E section 4), instead of querying it.
- **Only an active department can be chosen.** A department deactivated after it was chosen stays on the practitioner while other fields are edited; the picker keeps it as an option so an edit does not drop it. Choosing it again after a change away is refused.
- **Another hospital's department** is invisible under RLS, so it is refused the same way (`VALIDATION_FAILED` on `departmentId`); the composite foreign key `(tenant_id, department_id)` is the last guard.
- **An edit answers with the record as read back,** so the department's code and names in the answer are the stored ones.

## Verification

| Command                                                                      | Result                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm db:deploy` (local Docker, then Supabase)                               | `20261109100000_practitioner_department` applied on both |
| `vitest run src/practitioners.api.spec.ts src/departments.api.spec.ts` (api) | 21 of 21 (12 practitioner, 9 department)                 |
| `vitest run src/domain` (mod-patients)                                       | 37 of 37                                                 |
| `vitest run src/components/practitioners` (web)                              | 7 of 7                                                   |
| `playwright test e2e/practitioners.spec.ts e2e/departments.spec.ts`          | 9 of 9 after matching the toast's first copy             |
| `pnpm turbo run build lint typecheck`, `pnpm boundaries:check`, tests        | Green; 26 of 26 test tasks (api 157, web 41)             |

## Known limitations

- **No department filter on the practitioners list** yet; reception filters by department in the booking screens (T-SCH-02).
- **The choices route is for practitioner editors.** Reception gets its own read of departments and doctors with the scheduling permissions (T-SCH-01).

Deploy impact: migration `20261109100000_practitioner_department` (a nullable column, a foreign key, an index and a column grant; expand-only). Already applied on Supabase.

## How to debug

- **The picker is empty:** the hospital has no active department; add one under Departments.
- **`VALIDATION_FAILED` on `departmentId`:** the department is inactive or belongs to another hospital.
- **"permission denied for table practitioner" when saving a department:** the column grant on `department_id` is missing; compare `\dp hms.practitioner` with the migration.
