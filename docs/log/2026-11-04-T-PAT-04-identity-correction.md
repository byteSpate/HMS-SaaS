# T-PAT-04: identity correction with history

- **Date:** 2026-11-04
- **Commit:** this commit (feature branch `feat/PAT-patient-registry`)
- **Implements:** T-PAT-04; UC-PAT-02; FR-PAT-008; SP-03; FR-AUD-001; C-029, C-034; AT-PAT-010; Q-036 interim (permission-gated, no merge)

## What was built

`GET /api/v1/patients/{patientId}` returns a patient for the identity screen: the banner fields, the full birth facts, the address, the masked NID and the `version` (`patient.record.search`). `POST /api/v1/patients/{patientId}/identity` corrects it (`patient.identity.edit`, idempotent) with `{ expectedVersion, reason, changes }`. Only the fields in `changes` change, and a value equal to the current one is no change. `null` clears an optional field, but a name must remain (C-034). The MRN and patient ID cannot be sent at all: the schema refuses unknown keys (UC-PAT-02 D2). A different current version answers `409 STALE_RECORD` and changes nothing (SP-03). Each correction writes, in one transaction: the new values and `version + 1`; a row in the new append-only `hms.patient_identity_history` with the changed fields, their previous values and the reason; the audit event `patient.identity.changed` (field names only, with the reason); and the outbox event `PatientIdentityChanged`. A corrected NID is compared by its keyed hash, replaced sealed, and its previous value stays in the history sealed and by its last four digits.

`STALE_RECORD` (409) joins the error catalog, with messages in both language catalogs.

## Files

| File                                                                                   | Purpose                                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/database/prisma/migrations/20261104120000_patient_identity_history`          | History table (RLS, append-only); column UPDATE grants       |
| `packages/database/prisma/schema.prisma`                                               | `PatientIdentityHistory` model                               |
| `packages/contracts/src/patients.ts`, `errors.ts`                                      | Detail, correction request, version response; `STALE_RECORD` |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                         | `STALE_RECORD` message                                       |
| `packages/mod-patients/src/domain/identity-correction.ts`, `.spec.ts`                  | What a correction changes; 5 tests                           |
| `packages/mod-patients/src/domain/patient-identity.ts`                                 | Shared field error; birth errors placed under `changes.`     |
| `packages/mod-patients/src/infrastructure/patient-identity.repository.ts`              | Load, versioned update, NID save, history insert             |
| `packages/mod-patients/src/application/patient-identity.service.ts`, `patient-view.ts` | Detail and correction; shared banner view                    |
| `packages/mod-patients/src/http/patients.controller.ts`, `patients.module.ts`          | Two routes, shared ID pipe                                   |
| `apps/api/src/patients.api.spec.ts`                                                    | 5 API tests                                                  |

## Decisions applied

- **Column grants, not a table grant:** `hms_app` may update only the editable patient columns and the three NID value columns. The ID, hospital, MRN and creation fields are out of reach even for a bug in the app.
- **Version checked twice:** once on read for a clear answer, and again in the `UPDATE ... WHERE version = expected`, so two concurrent corrections cannot both win.
- **The history keeps previous values of changed fields only,** under RLS like the patient row; the audit keeps field names and the reason, never values (FR-AUD-001).
- **The NID is never decrypted to compare:** the keyed hash decides whether it changed.
- **The same age given again is no correction,** although its reporting day would differ.
- **Who may correct is the permission (Q-036 interim):** `patient.identity.edit`, which the RCP and ADM templates hold. Merging and temporary identities stay out (Q-036, C-034).

## Verification

| Command                                                  | Result                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| `vitest run` in `mod-patients`                           | 35 of 35 (5 new)                                           |
| `vitest run src/patients.api.spec.ts`                    | 28 of 28 (5 new); written after the code, passed first run |
| `pnpm turbo run test --concurrency=1`                    | 26 of 26 tasks; API 136, i18n 29, mod-patients 35          |
| `pnpm turbo run lint typecheck`, `pnpm boundaries:check` | Clean after removing a redundant type alias                |

## Known limitations

- **No duplicate check on correction:** changing a name or phone can make the record look like another patient; candidates are shown only at registration.
- **No history screen or read route yet;** the rows are kept for the identity screen and audit review.
- **An NID cannot be removed,** only replaced; removing one needs a decision on whether that is ever allowed.
- **The Bangla `STALE_RECORD` message** waits for the native Bangla review owed for RG-1.
- **No screen yet** for correction; it comes with the patient screens of this feature.

Deploy impact: migration `20261104120000_patient_identity_history` (new table and column grants; expand-only, safe while the previous version runs). No new variable.

## How to debug

`STALE_RECORD` on a correction: the patient changed since the screen loaded; the problem's `currentVersion` says which version to reload. `changes` refused with "Nothing differs": every value sent equals the current one. A `permission denied for table patient` from PostgreSQL: a correction tried to write a column outside the grant in the migration; add it there only if it is meant to be editable.
