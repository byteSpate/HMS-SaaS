# T-SCH-02: book, reschedule and cancel appointments

- **Date:** 2026-11-10
- **Commit:** this commit
- **Implements:** T-SCH-02; FR-SCH-001, FR-SCH-002 (appointments part), FR-SCH-003, FR-SCH-005, FR-AUD-001; UC-SCH-01, UC-SCH-02; AT-SCH-002..006; C-035, C-007; SP-03, SP-08; ADR-003

## What was built

Staff with `scheduling.appointment.book` see an **Appointments** section on the patient record. **Book appointment** lists the open sessions of a week (published, not ended) with the places left; a full session cannot be chosen. A booking takes one place in the session. **Reschedule** moves the booking to another session in one step: the new appointment is booked and linked, the old one becomes RESCHEDULED and its place is freed. **Cancel** needs a reason, keeps the record and frees the place. On **Schedules**, a published session has a **Patients** button listing who is booked, with cancel before the session ends and **No-show** after it. A booking creates no visit or invoice (FR-SCH-001).

Every command is one transaction with an audit event (`scheduling.appointment.booked`, `.rescheduled`, `.cancelled`, `.no_show`) and an `AppointmentChanged` outbox event.

## Files

| File                                                                                        | Purpose                                                                                                     |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261110120000_appointment/migration.sql`              | Table, composite FKs, status and reason CHECKs, one live booking per patient and session, RLS, column grant |
| `packages/database/prisma/schema.prisma`                                                    | `Appointment` model and back-relations                                                                      |
| `packages/contracts/src/appointments.ts`, `errors.ts`, `index.ts`                           | Book, reschedule, cancel, no-show, list schemas; `CAPACITY_FULL` (409)                                      |
| `packages/mod-scheduling/src/domain/appointment.ts` (+ spec)                                | Which session takes bookings; which changes a booking allows                                                |
| `packages/mod-scheduling/src/infrastructure/appointment.repository.ts`                      | Appointment rows                                                                                            |
| `packages/mod-scheduling/src/infrastructure/schedule-session.repository.ts`                 | `takePlace`, `releasePlace`, bookable filter; cancel checks the count too                                   |
| `packages/mod-scheduling/src/application/appointment.service.ts`                            | The commands and lists                                                                                      |
| `packages/mod-scheduling/src/http/appointments.controller.ts`, `scheduling.module.ts`       | `/api/v1/appointments` routes                                                                               |
| `packages/mod-patients/src/infrastructure/patient.repository.ts`, `index.ts`                | `isBookablePatient`, exported                                                                               |
| `packages/ui/src/primitives/Radio.tsx` (+ test), `index.ts`                                 | Radio button with its label as one target                                                                   |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                              | `appointments.*`, `errors.api.CAPACITY_FULL`                                                                |
| `apps/web/src/components/appointments/*`, `apps/web/src/api/appointments.ts`                | Book/reschedule and cancel dialogs, the table, the patient section, the session list                        |
| `apps/web/app/(app)/patients/[patientId]/page.tsx`, `apps/web/app/(app)/schedules/page.tsx` | The Appointments section; the Patients button                                                               |
| `apps/api/src/appointments.api.spec.ts`                                                     | 10 API tests against PostgreSQL, including the last-place race                                              |
| `apps/web/e2e/appointments.spec.ts`, `e2e/support/mock-appointments.ts`, `mock-api.ts`      | 4 browser tests and the contract-valid mock                                                                 |

## Decisions applied

- **C-035, no overbooking:** a place is taken by one conditional UPDATE (`booked_count < capacity`, published, not ended). The row lock serializes concurrent bookings, so the second one for the last place changes nothing and gets `CAPACITY_FULL` (AT-SCH-003). The `booked_count BETWEEN 0 AND capacity` CHECK stays as the last guard.
- **A booking does not bump the session's version,** so the session's own publish/cancel is not made stale by every booking. Instead, cancelling a session now also requires `booked_count = 0` in its UPDATE, so a booking that wins the race keeps its session.
- **Before the end: cancel or reschedule. After the end: no-show only** (FR-SCH-005), so the record says what happened. A no-show keeps its place counted (the session's attendance figure).
- **CHECKED_IN, RESCHEDULED, CANCELLED and NO_SHOW are final here** (UC-SCH-02 D1); check-in itself is T-VIS-01.
- **One live booking per patient and session:** checked first (`VALIDATION_FAILED` on `patientId`), with a partial unique index as the backstop.
- **Only mod-patients reads patients:** scheduling calls `isBookablePatient`; names and MRN are read through the appointment's foreign key, as practitioners are for sessions.
- **Booking needs its own permission,** not `scheduling.schedule.manage`; `GET /appointments/bookable-sessions` gives the booker the open sessions.
- **The radio picker went into `@hms/ui`,** because raw inputs are not allowed in the app (lint rule).

## Verification

| Command                                                                               | Result                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` (local Docker only)                                                  | `20261110120000_appointment` applied, after fixing the self-reference order (first run failed with 42830 and was marked rolled back)                                                                                                                                                                                                                           |
| `vitest run` (mod-scheduling)                                                         | 16 of 16                                                                                                                                                                                                                                                                                                                                                       |
| `vitest run src/appointments.api.spec.ts src/schedule-sessions.api.spec.ts` (api)     | 21 of 21                                                                                                                                                                                                                                                                                                                                                       |
| `vitest run` (web)                                                                    | 52 of 52                                                                                                                                                                                                                                                                                                                                                       |
| `vitest run src/primitives/Radio.test.tsx` (ui)                                       | 2 of 2                                                                                                                                                                                                                                                                                                                                                         |
| `playwright test e2e/appointments.spec.ts e2e/schedules.spec.ts e2e/patients.spec.ts` | 11 of 11, axe clean                                                                                                                                                                                                                                                                                                                                            |
| Local CI (format, build, lint, typecheck, boundaries, all tests)                      | Build, lint, typecheck 49 of 49; no dependency violations; `turbo run test --concurrency=1 --force` 28 of 28 tasks (api 178, ui 179, platform 53). In a parallel run ui and platform fail on load; platform also fails when Docker is not running (ECONNREFUSED 5432/6379). `format:check` shows only CRLF noise; changed files pass with `--end-of-line auto` |

## Known limitations

- **No "next visit" booking** (FR-SCH-006): it needs a visit, which T-VIS adds; `follow_up_of_visit_id` comes then.
- **No appointment slip print** (UC-SCH-01 step 6) yet.
- **Reschedule is offered on the patient record only;** the session's patient list offers cancel and no-show. Moving every patient of a session at once is not built.
- **A rare double-booking race** (the same patient booked twice at the same instant) ends at the partial unique index as a 500 instead of a field error.
- **Bangla texts** need the native-speaker review of terms (A1).
- **Supabase does not have this migration or `20261110090000_schedule_session` yet.**

Deploy impact: migration `20261110120000_appointment` (new table, indexes, RLS policy, column grant; expand-only). Not yet applied on Supabase.

## How to debug

- **`CAPACITY_FULL`:** `booked_count` has reached `capacity`; compare with `SELECT status, count(*) FROM hms.appointment WHERE schedule_session_id = ... GROUP BY status` (BOOKED, CHECKED_IN and NO_SHOW hold places).
- **`VALIDATION_FAILED` on `sessionId`:** the session is a draft, cancelled, ended, or of another hospital.
- **`VALIDATION_FAILED` on `patientId`:** the patient is of another hospital, or already booked in that session.
- **`INVALID_TRANSITION`:** the appointment is not BOOKED, or a cancel came after the session ended (mark a no-show), or a no-show before it ended.
- **A session cannot be cancelled:** it has bookings; cancel or move them first.
- **"permission denied for table appointment":** the column grant is missing; compare `\dp hms.appointment` with the migration.
