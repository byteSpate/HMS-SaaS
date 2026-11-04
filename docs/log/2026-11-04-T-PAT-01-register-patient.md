# T-PAT-01: register a patient after reviewing duplicates

- **Date:** 2026-11-04
- **Commit:** this commit (feature branch `feat/PAT-patient-registry`)
- **Implements:** T-PAT-01; UC-PAT-01; FR-PAT-001, -002, -005, -006, -009, -011; FR-AUD-001; C-033, C-034, C-024, C-025; ADR-003

## What was built

A receptionist can register a patient. While the form is filled in, `POST /api/v1/patients/duplicate-candidates` lists possible existing patients: the same mobile number written any way (FR-PAT-003), or a similar name in Bangla or English with a compatible sex and a birth year within 2 years. Each row says why it matched. `POST /api/v1/patients` then creates the patient with a server MRN, `{PREFIX}-{seq:6}` from the hospital's numbering policy (C-033), or `MRN-000001` style until a prefix is published. If candidates exist, the request must confirm and list every one it showed. Otherwise it answers `422 VALIDATION_FAILED` with `reason: DUPLICATE_CANDIDATES_PRESENT` and `candidateIds`. An age-only registration stores the age, the day it was given and an estimated birth year, never an invented date (FR-PAT-006). The command is idempotent and writes the audit event `patient.registered` and the outbox event `PatientRegistered` in its transaction.

## Files

| File                                                                             | Purpose                                                               |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261104090000_patient_registry`            | `hms.patient`, CHECKs, trigram indexes, RLS, no UPDATE for the app    |
| `packages/database/prisma/schema.prisma`                                         | `Patient` model                                                       |
| `docker/postgres/initdb/10-roles.sql`, `docker/postgres/supabase/30-pg-trgm.sql` | `pg_trgm` in schema `hms`, created by an administrator                |
| `packages/contracts/src/patients.ts`, `errors.ts`                                | Request and response schemas; `reason` and `candidateIds` on problems |
| `packages/domain-kernel/src/calendar-date.ts`                                    | The hospital's date in its time zone                                  |
| `packages/mod-patients/` (new)                                                   | Domain rules, repository, service, controller, module                 |
| `apps/api/src/app.module.ts`, `package.json`                                     | Registers the module                                                  |
| `apps/api/src/patients.api.spec.ts`                                              | 10 API tests                                                          |

## Decisions applied

- **C-034:** name in one script at least, sex, birth date or age, and the mobile number. `phone` is a required key whose value is `null` when the patient has none. A number must be a Bangladesh mobile (11 digits, `013` to `019`).
- **The candidate lookup is a POST**, not the GET in plan G section 8, so names and phone numbers never sit in URLs or request logs.
- **Candidates are checked again inside the command**, and a confirmation covers only the candidates it lists, so a patient registered after the screen was drawn is not missed.
- **NID is not in this task.** Storage and encryption are decided in T-PAT-03, so registration takes no NID yet and the same-NID signal of FR-PAT-011 comes with it.
- **UNKNOWN sex matches any sex** for candidates: one extra row is safer than a missed duplicate.
- **Hospital date:** `Asia/Dhaka`, because each hospital has one facility in Bangladesh for now (C-024).
- **Matching values** (similarity 0.4, 2 years, 20 rows) are tuning constants in `mod-patients/src/domain/duplicate-policy.ts`, not policy.

## Verification

| Command                                                                | Result                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `vitest run src/patients.api.spec.ts`, first run                       | 9 of 10 failed (`operator does not exist: text % text`)    |
| Same, after qualifying `OPERATOR(hms.%)` and the clock fix in the test | 10 of 10                                                   |
| `pnpm turbo run build lint typecheck`                                  | 46 of 46                                                   |
| `pnpm boundaries:check`                                                | No violations                                              |
| `pnpm turbo run test --concurrency=1`                                  | 26 of 26 tasks; API 118, mod-patients 13, domain-kernel 12 |
| Prettier on the changed files                                          | Clean                                                      |

## Known limitations

- **Two receptionists registering the same person at the same moment** can both succeed, because a candidate check cannot lock rows that do not exist yet. Merging is out of scope (Q-036).
- **No screen yet:** the registration and search screens come later in this feature, before its pull request.
- **No NID, no temporary identity** (T-PAT-03; FR-PAT-004 is out of RP-A by C-034).
- **The duplicate-candidate route needs `patient.record.register`.** Search (T-PAT-02) will use `patient.record.search`.
- **Name similarity in Bangla** relies on pg_trgm treating Bangla letters as word characters, which holds for the UTF-8 locales of the local database and Supabase; combining marks such as the hasant are ignored by it.

Deploy impact: **run `docker/postgres/supabase/30-pg-trgm.sql` as `postgres` before the migration** (new extension `pg_trgm` in schema `hms`); migration `20261104090000_patient_registry` (new table, expand-only); new module `mod-patients` in the API build. No new environment variable.

## How to debug

`pg_trgm must exist in schema hms` during migration: the administrator script was not run. `operator does not exist: text % text`: SQL used the bare `%` instead of `OPERATOR(hms.%)`. A registration refused with `DUPLICATE_CANDIDATES_PRESENT` although the user confirmed: a candidate is missing from `shownCandidateIds`; compare it with `candidateIds` in the problem. A wrong estimated birth year: check `reported_age_on`, which is the Dhaka date of the request.
