# T-CLI-01: doctor worklist and consultation start

- **Date:** 2026-11-16
- **Commit:** this commit
- **Implements:** T-CLI-01; FR-CLI-002; FR-PRA-003; UC-CLI-01 step 1, D1 and D3; SCR-08; W-03; F sections 4.3, 6, 7.3 and 8; C-009, C-011, C-040; ADR-015; SP-01, SP-03; AT-CLI-003, AT-CLI-004

## What was built

A doctor opens **My worklist** and sees today's sessions with their patients in queue order: serial number, name and MRN, status, and minutes waited. The statuses are Expected (booked, not arrived), Waiting for payment (checked in, doctor fee not fully paid), Waiting, In consultation and Done. The list polls every 20 seconds while the tab is visible. It sends the last ETag, the API answers `304` while nothing changed, and the screen shows "Updated hh:mm:ss". Focus starts on **Open next patient**, so Enter opens the next waiting patient. A patient waiting for payment is greyed out with its reason and cannot be opened; the API refuses it with `PAYMENT_NOT_ELIGIBLE`. Starting a consultation creates it `IN_CONSULTATION` and opens its page, where the note comes with T-CLI-02.

To know who the signed-in doctor is, the administrator now links a practitioner to a **staff account** on the practitioner form (FR-PRA-003; owner decision 2026-11-16). The link grants no permission.

## Files

| File                                                                                                                         | Purpose                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261116090000_practitioner_account/migration.sql`                                      | `practitioner.user_id`, foreign key to the membership (same hospital), partial unique index, column grant |
| `packages/database/prisma/migrations/20261116100000_consultation/migration.sql`                                              | `consultation` table: one per visit, state and time CHECKs, RLS, column grants, no DELETE                 |
| `packages/database/prisma/schema.prisma`                                                                                     | `Practitioner.userId`, `Consultation` model and relations                                                 |
| `packages/contracts/src/practitioners.ts`                                                                                    | `userId` in requests, `account` in answers, `staffAccountChoiceSchema`                                    |
| `packages/contracts/src/worklist.ts`                                                                                         | Worklist, entry, session, start request and consultation contracts                                        |
| `packages/contracts/src/errors.ts`, `schedule-sessions.ts`                                                                   | `PAYMENT_NOT_ELIGIBLE` (409); `wallClockTime` exported                                                    |
| `packages/mod-identity-access/src/infrastructure/staff-accounts.repository.ts`                                               | Linkable accounts (active membership, account not disabled), names by ID                                  |
| `packages/mod-patients/src/{domain,infrastructure,application,http}/practitioner*`                                           | The link: checks, audit of `userId`, `GET /practitioners/account-choices`, `findPractitionerIdOfAccount`  |
| `packages/mod-scheduling/src/application/day-sessions.ts`                                                                    | A doctor's published sessions of a date with their booked and checked-in appointments                     |
| `packages/mod-billing/src/application/doctor-fee-eligibility.ts`                                                             | Whether each visit's doctor fee is eligible (every active line ELIGIBLE)                                  |
| `packages/mod-clinical/src/domain/worklist.ts` (+ spec)                                                                      | Status of an entry, queue order, start preconditions                                                      |
| `packages/mod-clinical/src/infrastructure/consultation.repository.ts`                                                        | Visits of appointments, version bump, consultation rows                                                   |
| `packages/mod-clinical/src/application/worklist.service.ts`, `http/worklist.controller.ts`                                   | `GET /worklist`, `POST /visits/{id}/consultation/start`, `GET /consultations/{id}`                        |
| `packages/platform/src/conditional-get.ts` (+ spec), `problem-details.filter.ts`                                             | `@ConditionalGet()`: ETag from the data, 304 on a matching If-None-Match                                  |
| `apps/api/src/http/cors.ts`                                                                                                  | Allows `If-None-Match`, exposes `ETag`                                                                    |
| `apps/api/src/worklist.api.spec.ts`, `practitioners.api.spec.ts`                                                             | 7 worklist tests; 3 account-link tests                                                                    |
| `packages/i18n/src/dates.ts`, `messages/en.ts`, `bn-BD.ts`                                                                   | `formatTimeOfDay` (HH:mm:ss); worklist, consultation, link and error texts                                |
| `apps/web/src/api/client.ts`, `worklist.ts`, `practitioners.ts`                                                              | `apiConditionalGet`; worklist client; account choices                                                     |
| `apps/web/app/(app)/worklist/page.tsx`, `consultations/[consultationId]/page.tsx`                                            | SCR-08 and the started consultation                                                                       |
| `apps/web/src/components/worklist/*`                                                                                         | Rules (+ test) and the session table                                                                      |
| `apps/web/src/components/practitioners/*`, `navigation.ts`                                                                   | Account picker; "My worklist" in the menu for `clinical.consultation.record`                              |
| `apps/web/e2e/worklist.spec.ts`, `practitioners.spec.ts`, `support/mock-worklist.ts`, `mock-api.ts`, `mock-practitioners.ts` | 4 worklist browser tests, 1 link test; the mock answers 304 by ETag                                       |

## Decisions applied

- **Owner decision 2026-11-16:** the account is linked on the practitioner form (not on the user form, and no doctor picker). One account per practitioner and one practitioner per account in a hospital: a service check with a field error, and a partial unique index as the backstop. The foreign key to `membership (tenant_id, user_id)` keeps the account in the practitioner's hospital.
- **Only the visit's doctor starts it** (UC-CLI-01 precondition). There is no covering doctor yet, so another doctor gets `PERMISSION_DENIED`, an unlinked account sees an empty worklist with the reason, and another hospital's visit is `NOT_FOUND` under RLS.
- **Eligibility comes from billing** (C-011, C-040): the doctor-fee invoice is eligible when every active line is ELIGIBLE. **A visit with no doctor-fee invoice counts as WAITING:** check-in lets the visit exist when no fee is configured (UC-VIS-01 A1), and blocking that doctor forever would be wrong. This is interim until the hospital sets every fee.
- **Two starts at once:** the start checks the visit's version and moves it on in an `UPDATE ... WHERE version` that locks the row, so one start succeeds and the other gets `STALE_RECORD`. After a reload, a second start is `INVALID_TRANSITION`. The unique `(tenant_id, visit_id)` index is the last backstop. Retries with the same Idempotency-Key replay the first answer (SP-01).
- **ETag polling (ADR-015):** the tag is a SHA-256 of the response data, taken before the envelope adds the per-request correlation ID. Worklists hold patient names, so the answer is `Cache-Control: no-store` and the web client keeps the tag itself. The tag is compared in the interceptor, not by Express's freshness check: a fetch with `If-None-Match` also sends `Cache-Control: no-cache` (Fetch standard), which Express reads as a forced reload. Nest always replies 200 to a value, so a match throws `NotModified` and the problem filter ends the response with `304`.
- **Statuses** follow F section 6 (neutral, amber, blue, purple, green). The consultation page shows "not available yet" for the note rather than a fake form.
- **Focus starts on "Open next patient"**, once, when the first waiting patient shows, so Enter works without a click and later polls never move the doctor's focus. Enter elsewhere outside a control does the same. Patients who become waiting are announced in the polite live region (F 7.3).

## Verification

| Command                                                          | Result                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @hms/database db:deploy` (local Docker)           | Both migrations applied                                                                                                                                                                                                                                                         |
| `vitest run src/worklist.api.spec.ts` (api)                      | 7 of 7: statuses and order, unlinked account, 304 then new data after a payment, PAYMENT_NOT_ELIGIBLE then start with audit and outbox, two starts (201 + STALE_RECORD, then INVALID_TRANSITION), other doctor or cashier 403 and other hospital 404, no DELETE or visit change |
| `vitest run src/practitioners.api.spec.ts` (api)                 | 15 of 15 (3 new: link and audit, one per account and refusals, picker permission)                                                                                                                                                                                               |
| `playwright test e2e/worklist.spec.ts e2e/practitioners.spec.ts` | 4 of 4 and 5 of 5, axe clean                                                                                                                                                                                                                                                    |
| `playwright test` (all)                                          | 76 of 76; `admin.spec.ts` "edits a role" timed out once on the dev server's first compile and passed on rerun                                                                                                                                                                   |
| `pnpm turbo run build lint typecheck`                            | 55 of 55                                                                                                                                                                                                                                                                        |
| `pnpm boundaries:check`                                          | No violations                                                                                                                                                                                                                                                                   |
| `pnpm turbo run test` (with `.env`)                              | 33 of 33 tasks; api 221, web 75, platform 55, clinical 10, patients 37                                                                                                                                                                                                          |
| `pnpm format:check`                                              | Only the known CRLF noise; `prettier --check --end-of-line auto .` flags 2 files outside this change (`AGENTS.md`, a local settings file)                                                                                                                                       |

## Known limitations

- **No covering doctor** and no doctor switch: the worklist is the linked practitioner's own.
- **Parking a patient** (UC-CLI-01 C1, back to WAITING) and **CONSULTED** come with T-CLI-02 (signing the note).
- **Results from the worklist** (FR-CLI-010) wait for the lab module.
- **The ETag is computed after the query**, so a poll saves the transfer and the render, not the database work. A per-tenant change counter (ADR-015) can replace it if the M section 7 load test asks for it.
- **Bangla texts** need the native-speaker review of terms (A1, Q-050).
- **Supabase does not have these two migrations yet.**

Deploy impact: two expand-only migrations (`20261116090000_practitioner_account`: one nullable column, a foreign key, a partial unique index and a grant; `20261116100000_consultation`: a new table). CORS change: `If-None-Match` is allowed and `ETag` exposed. No new variable, service or build step.

## How to debug

- **The worklist is empty:** is the account linked? `SELECT id, user_id FROM hms.practitioner WHERE user_id = '<user id>'`. Is the session `PUBLISHED` and dated today in Dhaka?
- **A paid patient still shows Waiting for payment:** `SELECT i.status, l.status, l.eligibility FROM hms.invoice i JOIN hms.invoice_line l ON l.invoice_id = i.id WHERE i.visit_id = '<visit>' AND i.type = 'DOCTOR_FEE'`.
- **Polling never returns 304:** the response must carry `ETag`, and the request `If-None-Match` (network tab). Behind another origin, CORS must expose `ETag`, or the client cannot read it and sends no tag.
- **Start is STALE_RECORD:** the visit's `version` moved (another start or a status change). Reload the worklist; the audit trail has `clinical.consultation.started`.
