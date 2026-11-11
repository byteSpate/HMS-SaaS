# T-VIS-01: check-in with the doctor-fee invoice

- **Date:** 2026-11-11
- **Commit:** this commit
- **Implements:** T-VIS-01; UC-VIS-01; FR-VIS-002, FR-VIS-004, FR-VIS-005, FR-SCH-004, FR-BIL-010; C-006, C-007, C-008, C-035, C-041; AT-VIS-001, AT-VIS-002, AT-VIS-003; SP-03, SP-08; FR-AUD-001; ADR-003

## What was built

Reception (`visit.checkin`) sees **Check in** on a booked appointment on its session date: on the patient record's appointments and in a session's patient list on Schedules. One confirmation does, in one transaction:

1. the appointment becomes CHECKED_IN (version checked);
2. the patient gets the session's next serial number, in check-in order (C-035);
3. one OPD_CONSULTATION visit is created with the hospital's facility, the doctor's department, the doctor, the appointment, the session and the arrival time (FR-VIS-004);
4. the doctor-fee invoice is issued through the charge interface (T-BIL-02) at the fee in force: the follow-up fee when the patient saw the same doctor within the doctor's follow-up window, otherwise the new-patient fee (C-041);
5. audit `scheduling.appointment.checked_in`, `visit.checked_in`, `billing.charge.posted`, and the outbox events `AppointmentChanged`, `VisitCheckedIn`, `ChargePosted`.

The dialog then shows the serial number and "Doctor fee invoice INV-000123 - new patient fee, Due 500.00". When the doctor has no fee in force, the visit is still created and the dialog says no invoice was issued (UC-VIS-01 A1).

New package `@hms/mod-clinical` (owns `visit`), route `POST /api/v1/visits/check-in`.

## Files

| File                                                                                                                                      | Purpose                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/database/prisma/migrations/20261111110000_visit/migration.sql`                                                                  | `visit` (one per appointment, one per serial number in a session, kind and consultation CHECKs, RLS, column grant); `schedule_session.last_queue_number`; visit foreign keys on `invoice` and `charge` |
| `packages/database/prisma/schema.prisma`                                                                                                  | `Visit`, `ScheduleSession.lastQueueNumber`, relations                                                                                                                                                  |
| `packages/contracts/src/visits.ts`, `index.ts`                                                                                            | Check-in request, visit and doctor-fee outcome schemas                                                                                                                                                 |
| `packages/mod-scheduling/src/application/check-in.ts`, `domain/appointment.ts` (+ spec), `infrastructure/*`, `index.ts`                   | `checkInAppointment`: the check-in rule, the status change, the serial number; shared appointment error helpers                                                                                        |
| `packages/mod-billing/src/application/doctor-fee.ts`, `domain/price-list.ts` (+ spec), `index.ts`                                         | `issueDoctorFee` and the follow-up rule                                                                                                                                                                |
| `packages/mod-clinical/` (new)                                                                                                            | Visit repository, check-in service, controller, module                                                                                                                                                 |
| `apps/api/src/app.module.ts`, `package.json`, `check-in.api.spec.ts`                                                                      | Module wired in; 5 API tests                                                                                                                                                                           |
| `apps/api/src/charges.api.spec.ts`                                                                                                        | Charges now post against real visits (the new foreign key)                                                                                                                                             |
| `apps/web/src/api/visits.ts`, `src/components/appointments/check-in-dialog.tsx`, `appointment-table.tsx`, `appointment-rules.ts` (+ test) | The Check in button and dialog                                                                                                                                                                         |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                                                            | `checkIn.*`                                                                                                                                                                                            |
| `apps/web/e2e/appointments.spec.ts`, `e2e/support/mock-appointments.ts`                                                                   | 2 browser tests and the mock check-in                                                                                                                                                                  |

## Decisions applied

- **One transaction across three modules:** scheduling (`checkInAppointment`), clinical (the visit) and billing (`issueDoctorFee`) are called through their public entries inside the clinical module's `withTenant` transaction, so a failure leaves no half check-in.
- **Check-in only on the session's hospital date:** UC-VIS-01's early or late tolerance is a proposed policy and is not built.
- **Serial number:** `schedule_session.last_queue_number` is raised by one UPDATE ... RETURNING after the appointment row is locked; a unique index on (session, serial number) is the last guard.
- **R1, R2:** the same Idempotency-Key returns the same visit (the idempotency record waits for the first request); another key finds the appointment already CHECKED_IN and gets STALE_RECORD.
- **Follow-up (C-041):** counted in hospital calendar days from the patient's last consultation visit with the same doctor (cancelled visits do not count), against the window of the fee version in force at arrival. Billing owns this rule; the clinical module only says when the last consultation was.
- **The visit's department** is the doctor's department (AS-015); no department when the doctor has none.
- **A1:** no fee in force means no charge and no invoice; the answer carries `doctorFee.status = POLICY_NOT_CONFIGURED` and the visit stays.
- **The source reference** of the doctor-fee charge is `('clinical', 'visit', visitId, 'CHECKED_IN')` (FPR-09).

## Verification

| Command                                                                                 | Result                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` (local Docker only)                                                    | `20261111110000_visit` applied. Test invoices from the T-BIL-02 runs pointed at made-up visits, so they were deleted from the local container first (local only; CI and Supabase start without them)                                                                                                                                                                                              |
| `vitest run` (mod-scheduling, mod-billing)                                              | 10 and 11 passed                                                                                                                                                                                                                                                                                                                                                                                  |
| `vitest run src/check-in.api.spec.ts src/charges.api.spec.ts` (api, real PostgreSQL)    | 5 of 5 and 6 of 6                                                                                                                                                                                                                                                                                                                                                                                 |
| `vitest run src/components/appointments` (web)                                          | Rules 6 of 6                                                                                                                                                                                                                                                                                                                                                                                      |
| `playwright test e2e/appointments.spec.ts`                                              | 7 of 7, axe clean                                                                                                                                                                                                                                                                                                                                                                                 |
| Local CI (format, build, lint, typecheck, boundaries, all tests)                        | Format clean; build, lint, typecheck 55 of 55; no dependency violations (794 modules); `turbo run test --concurrency=1` 32 of 32 tasks, api 195. An earlier run was stopped by Claude Code for low memory                                                                                                                                                                                         |
| Smoke test on the real stack (API 4100, web 3100, local Docker database, demo hospital) | A real browser: a smoke-test administrator (own TOTP secret) set and published a fee; reception booked today and checked in. Dialog: serial number 1, INV-000001, due 500.00. Database: visit OPEN with serial 1, appointment CHECKED_IN, invoice ISSUED 500.00 with one DOCTOR_FEE_NEW line, source clinical/visit/CHECKED_IN, four audit events. The project lead then tested by hand: all good |

## Known limitations

- **No visit screen or list yet:** after closing the dialog the appointment shows CHECKED_IN; the visit and its serial number appear on the doctor's worklist (T-CLI-01).
- **No walk-in visit** (T-VIS-02) and no visit completion or cancellation (FR-VIS-003).
- **No token print** of the serial number (T-PRN-02) and no shortcut to the cashier queue (T-BIL-03/04).
- **No early or late check-in tolerance** (UC-VIS-01 precondition, proposed).
- **Bangla texts** need the native-speaker review of terms (A1).
- **Supabase does not have this migration yet.**

Deploy impact: migration `20261111110000_visit` (new table `visit`, a column on `schedule_session`, foreign keys on `invoice` and `charge`, RLS policy, grants; expand-only, but the two foreign keys fail if `invoice` or `charge` already hold rows without a visit, which only test data could). New module `mod-clinical` in the API build; no new variable, service or build step.

## How to debug

- **`INVALID_TRANSITION` on check-in:** the appointment is not BOOKED, or today (hospital date) is not the session date.
- **`STALE_RECORD` on check-in:** someone else checked the appointment in or changed it; reload the list.
- **No invoice after check-in:** `doctorFee.status` was `POLICY_NOT_CONFIGURED`; check the doctor's fee in the version in force (T-BIL-01 log).
- **Wrong fee (new or follow-up):** `SELECT arrived_at FROM hms.visit WHERE patient_id = '...' AND attending_practitioner_id = '...' ORDER BY arrived_at DESC` and compare the days with the doctor's `follow_up_days`.
- **Serial numbers:** `SELECT last_queue_number FROM hms.schedule_session WHERE id = '...'` and `SELECT queue_number FROM hms.visit WHERE schedule_session_id = '...' ORDER BY queue_number`.
