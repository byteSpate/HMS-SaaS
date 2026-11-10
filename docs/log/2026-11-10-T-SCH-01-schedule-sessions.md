# T-SCH-01: schedule sessions

- **Date:** 2026-11-10
- **Commit:** this commit
- **Implements:** T-SCH-01; FR-SCH-002 (sessions part), FR-AUD-001; AT-SCH-001; C-035 (answers Q-037), C-024; SP-03, SP-08; ADR-003

## What was built

Staff with `scheduling.schedule.manage` (reception and the hospital administrator in the role templates) open **Schedules** (`/staff/schedules`) and see the doctor sessions of one week, starting on the hospital's today. They add a session for an active doctor: a date, a start and end time on the hospital clock (Asia/Dhaka) and a fixed capacity (1 to 500). A new session is a **draft**; **Publish** opens it for booking (T-SCH-02). A session with no bookings can be **cancelled** after a confirmation; it stays in the list. A session that has already ended is refused on create and on publish, and so is a session that overlaps another non-cancelled session of the same doctor. Every change writes an audit event (`scheduling.session.created`, `.published`, `.cancelled`) and a `ScheduleSessionChanged` outbox event in the same transaction.

The new package `@hms/mod-scheduling` owns `schedule_session` (D section 5); appointments join it in T-SCH-02.

## Files

| File                                                                                                   | Purpose                                                                          |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261110090000_schedule_session/migration.sql`                    | Table, composite FKs, status, time and capacity CHECKs, RLS, column UPDATE grant |
| `packages/database/prisma/schema.prisma`                                                               | `ScheduleSession` model and back-relations                                       |
| `packages/contracts/src/schedule-sessions.ts`, `index.ts`                                              | Create, change and list schemas; practitioner choice; session view               |
| `packages/domain-kernel/src/calendar-date.ts`                                                          | `instantAt` (hospital date + HH:mm to an instant) and `wallClockTimeIn`          |
| `packages/mod-scheduling/` (new)                                                                       | Domain rules, repository, service, controller, `SchedulingModule`                |
| `packages/mod-patients/src/infrastructure/practitioner.repository.ts`, `index.ts`                      | `listPractitionerChoices`, `isSchedulablePractitioner`, exported                 |
| `packages/mod-identity-access/src/index.ts`                                                            | Exports `hospitalFacilityId` (the session's facility, C-024)                     |
| `apps/api/src/app.module.ts`, `apps/api/package.json`                                                  | Wires `SchedulingModule`                                                         |
| `packages/i18n/src/dates.ts`, `index.ts`                                                               | `isoDateIn`: the facility's YYYY-MM-DD date, for date inputs and queries         |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                         | `schedules.*`, `nav.schedules`                                                   |
| `apps/web/app/(app)/schedules/page.tsx`                                                                | Week list, publish, cancel with confirmation                                     |
| `apps/web/src/components/schedules/session-dialog.tsx`, `session-form.ts`                              | Add dialog; form rules, API field refusals, week dates                           |
| `apps/web/src/api/schedule-sessions.ts`, `apps/web/src/navigation.ts`                                  | Client with Idempotency-Keys; menu entry                                         |
| `apps/api/src/schedule-sessions.api.spec.ts`                                                           | 11 API tests against PostgreSQL                                                  |
| `packages/mod-scheduling/src/domain/schedule-session.spec.ts`                                          | 9 domain tests                                                                   |
| `apps/web/e2e/schedules.spec.ts`, `e2e/support/mock-schedule-sessions.ts`, `mock-api.ts`               | 4 browser tests and the contract-valid mock                                      |
| `docs/planning/docs/A1-glossary.md`, `C-srs/C02-patients-scheduling.md`, `N-traceability-readiness.md` | Q-037 no longer shown as open: C-035 answers it                                  |

## Decisions applied

- **C-035:** fixed capacity per session, never exceeded. `booked_count BETWEEN 0 AND capacity` is a CHECK now, so T-SCH-02's booking transaction gets `CAPACITY_FULL` from the database on the last-slot race (probe P14). Serial numbers come at check-in (T-VIS-01), not here.
- **Draft, then publish:** the task is "session creation and publication" (G). The draft SQL defaulted to `PUBLISHED`; this table defaults to `DRAFT`.
- **Times on the hospital clock:** the form sends `sessionDate` + `HH:mm`; the API stores `starts_at`/`ends_at` instants and the hospital `session_date`. Time zone fixed to Asia/Dhaka like the patients module (C-024); read `facility.timezone` when a hospital can have zones.
- **Ended, not started:** a session of today that is still running may be entered; one whose end has passed is refused (AT-SCH-001).
- **No overlap for one doctor (added during the work):** not in the spec, but two sittings of one doctor at once are always a typing mistake or a double entry. Cancelled sessions do not count; back to back is allowed.
- **Fixed once entered:** practitioner, facility, date, times and capacity have no UPDATE grant. A different sitting is a new session; cancel the wrong one.
- **Cancel only without bookings:** a session with bookings is `INVALID_TRANSITION` until its appointments are moved (T-SCH-02), so no patient loses a booking silently.
- **Only mod-patients reads practitioners:** scheduling calls the two exported functions; RLS hides other hospitals' doctors, so they read as not schedulable.
- **The picker label is "name, specialty"** so two doctors with one name can be told apart (FR-PRA-001).

## Verification

| Command                                                        | Result                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm db:deploy` (local Docker only)                           | `20261110090000_schedule_session` applied                                                                    |
| `vitest run` (mod-scheduling)                                  | 9 of 9                                                                                                       |
| `vitest run src/schedule-sessions.api.spec.ts` (api)           | 11 of 11                                                                                                     |
| `vitest run` (api, full)                                       | 167 of 168; the failure was a 5 s timeout in `user-admin.api.spec.ts`, 15 of 15 when re-run alone            |
| `vitest run` (domain-kernel, i18n, web)                        | 16, 30 (catalog key checks included), 47                                                                     |
| `playwright test e2e/schedules.spec.ts`                        | 4 of 4, axe clean                                                                                            |
| `playwright test` (web, full)                                  | 49 of 56 on `next dev`; the 7 failures (sign-in URL waits in other screens) pass 7 of 7 with `--last-failed` |
| `pnpm turbo run build lint typecheck`, `pnpm boundaries:check` | Green after one lint fix; no dependency violations                                                           |
| `pnpm turbo run test`                                          | Green except the known flaky "1,000 parallel allocations" platform test; 5 of 5 alone                        |
| `prettier --check --end-of-line auto` on the changed files     | Clean after `--write` on 5 new files                                                                         |

## Known limitations

- **No weekly repeat:** FR-SCH-002 mentions weekday sessions. Each sitting is entered one by one for now; a "repeat weekly for N weeks" action can create dated sessions later without changing the table.
- **The overlap check is not race-proof:** two concurrent creates for the same doctor and time could both pass. An exclusion constraint needs `btree_gist`, which Supabase must enable first. Rare and harmless (one is cancelled).
- **No department on the session:** the doctor's department is shown through the practitioner. A doctor sitting for two departments needs a session department later.
- **No edit of a session:** cancel and add again.
- **Bangla texts** need the native-speaker review of terms (A1); "সেশন" is also the word used for the login session.
- **Supabase does not have this migration yet.**

Deploy impact: migration `20261110090000_schedule_session` (new table, indexes, RLS policy, column grant; expand-only). Not yet applied on Supabase: run `pnpm db:deploy` there when the owner asks.

## How to debug

- **`VALIDATION_FAILED` on `sessionDate`:** the session has ended by the API's clock (Asia/Dhaka). Check the server clock and the date/time entered.
- **`VALIDATION_FAILED` on `startTime`:** the doctor has another session, not cancelled, that overlaps. List the day with `GET /schedule-sessions?from=...&to=...&practitionerId=...`.
- **`VALIDATION_FAILED` on `practitionerId`:** the doctor is inactive or of another hospital.
- **`ENTITLEMENT_MISSING`:** the hospital does not have the `scheduling` module.
- **"permission denied for table schedule_session" on publish or cancel:** the column grant is missing; compare `\dp hms.schedule_session` with the migration.
- **Times shown an hour or day off:** the list shows `startTime`/`endTime` from the API, already on the hospital clock; `startsAt` is UTC.
