# T-CLI-03 (part 2): prescription and its print

- **Date:** 2026-11-18
- **Commit:** this commit
- **Implements:** T-CLI-03; FR-CLI-001, FR-CLI-004, FR-CLI-005, FR-CLI-006, FR-CLI-007 (print); UC-CLI-01 steps 4 and 5, R1, R2; UC-CLI-02; C-012, C-025, C-029, C-044, FPR-06; SP-01, SP-03; FR-AUD-001; AT-CLI-001, AT-CLI-002; Q-067 interim

## What was built

On the consultation screen the doctor now writes the prescription under the note (needs `clinical.prescription.create`). They find a medicine in the hospital catalogue by brand or generic name and add it as a line. Each line has a free-text dose, a route, frequency and duration from the hospital's lists, instructions in Bangla and/or English, an optional quantity, the supply choice (hospital pharmacy, the default, or buy outside) and an optional patient note. The draft autosaves two seconds after the last change, version-checked, so a crashed browser loses nothing.

**Sign** needs at least one line, and each line must say how often or carry instructions. Every medicine must still be active. Signing makes version 1 and writes one `prescription_line` row per line with the medicine and the supply choice. It emits `PrescriptionSigned` with the count of hospital-pharmacy lines. It creates no charge and no stock movement (FR-CLI-001; AT-CLI-001, AT-CLI-002 tested).

A signed prescription changes only through **Amend** with a reason (also needs `clinical.document.amend`). The amendment signs as version 2, linked to version 1, with its own lines, and earlier versions stay readable. An unsigned draft or an amendment can be discarded.

**Print** renders the latest signed version as an A4 page in Bangla, English or both. The page has:

- the doctor's name, degrees and registration number
- the patient and MRN
- the date and the allergy status from the signed note ("Not recorded" when there is no signed note, never "no allergies")
- the lines with where each is supplied from
- the note's advice and the next booked visit with this doctor
- a signature line and "Signed electronically by ... at ..."

From version 2 on the page says "Amended" with the date. Printing is audited and changes nothing.

## Files

| File                                                                                              | Purpose                                                                                                   |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261118100000_prescription/migration.sql`                   | `clinical_document.kind` adds PRESCRIPTION, one document per kind; `prescription_line` (append-only, RLS) |
| `packages/database/prisma/schema.prisma`                                                          | `PrescriptionLine`; `Consultation.documents` (was a one-to-one `note`)                                    |
| `packages/contracts/src/prescriptions.ts`, `index.ts`                                             | Line input and stored line, content, draft, sign, amend, print schemas                                    |
| `packages/mod-clinical/src/domain/clinical-document.ts`                                           | The draft, sign, amend and discard rules of every clinical document, moved out of the note                |
| `packages/mod-clinical/src/domain/consultation-note.ts`                                           | Now the shared rules plus the note's "one section written" rule (behaviour unchanged)                     |
| `packages/mod-clinical/src/domain/prescription.ts`                                                | Kept lines with catalogue copies, sign rules, still-active check, pharmacy line count                     |
| `packages/mod-clinical/src/application/clinical-documents.ts`                                     | Own-consultation check, version-checked change and screen view shared by note and prescription            |
| `packages/mod-clinical/src/application/prescription.service.ts`, `prescription-print.ts` (+ spec) | Use cases; pure print data                                                                                |
| `packages/mod-clinical/src/http/prescriptions.controller.ts`                                      | `GET`, `PUT draft`, `POST sign/amend/discard/prints` under `/consultations/{id}/prescription`             |
| `packages/mod-clinical/src/infrastructure/clinical-document.repository.ts`                        | Generic over the document kind; `insertVersion` returns the version ID                                    |
| `packages/mod-clinical/src/infrastructure/prescription-line.repository.ts`                        | Writes the lines of a signed version                                                                      |
| `packages/mod-clinical/src/infrastructure/consultation.repository.ts`                             | The consultation now carries its practitioner                                                             |
| `packages/mod-patients/src/infrastructure/practitioner.repository.ts`, `index.ts`                 | `findPractitionerPrintDetails` for the doctor header                                                      |
| `packages/mod-scheduling/src/infrastructure/appointment.repository.ts`, `index.ts`                | `findNextBookedDate` for the next visit line                                                              |
| `packages/print-templates/src/prescription.ts` (+ test), `index.ts`                               | The A4 prescription template                                                                              |
| `packages/testkit/src/opd-world.ts`                                                               | Doctors with their own accounts, a cashier, fee payment and a started consultation                        |
| `apps/api/src/prescriptions.api.spec.ts`                                                          | HTTP integration tests against PostgreSQL                                                                 |
| `apps/web/src/components/prescription/*`                                                          | Panel, editor with autosave, line fields, medicine picker, signed view, print, form rules (+ test)        |
| `apps/web/src/components/consultation/amend-dialog.tsx`, `note-view.tsx`                          | The amend dialog now serves the note and the prescription                                                 |
| `apps/web/src/api/prescriptions.ts`, `apps/web/app/(app)/consultations/[consultationId]/page.tsx` | API client; the panel on the consultation screen                                                          |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                    | `prescription.*` and the prescription `print.*` labels                                                    |
| `apps/web/e2e/prescription.spec.ts`, `support/mock-prescriptions.ts`, `support/mock-api.ts`       | Browser tests and their contract-valid mock                                                               |

## Decisions applied

- **The prescription is a second clinical document of the consultation** (owner choice 2026-11-18: its own draft, sign and amend). It reuses `clinical_document` and `clinical_document_version`, so the version rules, column grants and immutability of FPR-06 are the same as the note's. A unique index on (tenant, consultation, kind) allows one note and one prescription. The rules and the shared command helpers moved into `clinical-document.ts` and `clinical-documents.ts` instead of being copied.
- **Lines keep a copy of what was chosen:** the medicine (brand, generic, strength, form) and the route, frequency and duration labels are stored in the line as they were when written. A later catalogue edit never changes a draft already saved or a signed version (tested). A draft save refuses an inactive or unknown medicine, an inactive term or a term of the wrong kind, with a field error on that line.
- **Relational lines for the pharmacy:** each signed version writes `prescription_line` rows (medicine FK, supply choice, quantity) next to the JSON content, so Phase 4 can query hospital-pharmacy lines and link a dispense to a line. `hms_app` may not update or delete them (tested).
- **Sign rules (Q-067 interim):** at least one line, and each line has a frequency or instructions. The medicines are checked again at signing, so a medicine withdrawn after the draft was saved cannot be signed.
- **Permissions:** `clinical.prescription.create` ("create/sign prescription", C00 section 8) for read, draft, sign, discard and print; amend also needs `clinical.document.amend`. As with the note, only the consultation's own doctor sees the prescription; another doctor gets NOT_FOUND.
- **FR-CLI-006:** HOSPITAL_PHARMACY is recorded per line and counted in `PrescriptionSigned`; no dispense request exists before the pharmacy epic. EXTERNAL lines never reach the pharmacy.
- **Print on A4** (owner choice 2026-11-18, C-044 over FR-CLI-005's proposed A5). The page is rendered on the server and printed from a hidden frame, like receipts. Allergies come from the latest signed note; without one they print as "Not recorded" (FR-CLI-007).
- **Every command has an Idempotency-Key** (SP-01); a retried signature signs once (tested).

## Verification

| Command                                                                                    | Result                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:deploy` (local Docker)                                                            | `20261118100000_prescription` applied                                                                                                                                                     |
| `vitest run src/prescriptions.api.spec.ts` (api, real PostgreSQL)                          | 12 of 12, after fixing the test cashier's permission and one price-list race                                                                                                              |
| `vitest run` of the prescription, worklist, schedule-session and appointment API specs     | 47 of 47 (the note and worklist tests still pass after the refactor)                                                                                                                      |
| `vitest run` (mod-clinical)                                                                | 21 of 21                                                                                                                                                                                  |
| `vitest run` (print-templates)                                                             | 17 of 17 (7 new)                                                                                                                                                                          |
| `vitest run src/components/prescription` (web)                                             | 5 of 5                                                                                                                                                                                    |
| `vitest run` (i18n)                                                                        | 31 of 31 after removing three unused print labels                                                                                                                                         |
| `CI=1 playwright test e2e/prescription.spec.ts e2e/worklist.spec.ts e2e/medicines.spec.ts` | 13 of 13 on the production build                                                                                                                                                          |
| `pnpm turbo run build lint typecheck --continue`                                           | 58 of 58                                                                                                                                                                                  |
| `pnpm boundaries:check`                                                                    | No violations (953 modules)                                                                                                                                                               |
| `prettier --check` on every changed file                                                   | Clean                                                                                                                                                                                     |
| `pnpm turbo run test --concurrency=1`                                                      | 35 of 35 test tasks (api 247 of 247) on the second run; the first stopped on the outbox relay test, which timed out draining the day's backlog of test events and passes alone (11 of 11) |

## Riding along

- **Audit exception (owner decision 2026-11-18):** CI's `pnpm audit --prod --audit-level=high` failed on GHSA-fc5q-39xc-vjpf, a picomatch ReDoS with no patched release. The only path is next-intl's optional `@parcel/watcher`, for a CLI this project does not run, and its install script is already blocked. The advisory is in `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`. Remove it once next-intl or picomatch ships a fix.

## Known limitations

- **No pharmacy request yet:** HOSPITAL_PHARMACY lines are recorded and announced (`PrescriptionSigned`), but dispensing, stock and charges come with the pharmacy epic (EP-19). Stock is not reserved (FR-PHA-009 is OPEN, Q-014).
- **The field set is the Q-067 interim:** free-text dose and strength, no generic-only prescribing, no dose calculator or interaction checks. The medical director and chief pharmacist may change it, which means a new contract version and a migration of the JSON.
- **No print history or reprint marking:** each print is audited, but there is no `print_event` table or "Copy n" stamp yet (T-PRN-02). The template is not configurable per hospital, and there is no A5 option.
- **Next visit** comes from a booked appointment with the same doctor after the consultation date. A next visit planned in the note is not read.
- **The patient banner shows no age or sex** yet: the shared patient reference carries name and MRN only.
- **A covering doctor cannot write another doctor's prescription;** only the consultation's doctor can, as for the note.
- **Supabase is behind:** both migrations of this feature are applied locally only. `pnpm db:deploy` against Supabase applies them (see the deploy impact below).
- **The Bangla texts** need the native-speaker review (A1, Q-050).

Deploy impact: migration `20261118100000_prescription`. It replaces `clinical_document_kind_check`, replaces the unique index (tenant, consultation) with (tenant, consultation, kind) and adds the append-only `prescription_line` table. Apply it with this version of the API: the previous version reads a consultation's note without filtering by kind, so it is safe only until the first prescription is written. No new variable, service or origin.

## How to debug

- **The prescription panel is missing:** the session's `permissions` lack `clinical.prescription.create`.
- **`VALIDATION_FAILED` on `lines.N.medicineId` while saving:** the medicine is inactive or not in this hospital's catalogue; on sign it means the medicine was deactivated after the draft was saved.
- **`lines.N.frequencyTermId` on sign:** that line has neither a frequency nor instructions.
- **`INVALID_TRANSITION` on print:** nothing is signed yet.
- **The print says "Not recorded" for allergies:** the consultation note is not signed. A draft note does not count.
- **Pharmacy lines for a patient:** `SELECT * FROM hms.prescription_line WHERE patient_id = ... AND fulfilment = 'HOSPITAL_PHARMACY'` inside `withTenant`.
