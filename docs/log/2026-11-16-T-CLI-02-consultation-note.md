# T-CLI-02: consultation note (draft, sign, amend)

- **Date:** 2026-11-16
- **Commit:** this commit
- **Implements:** T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-01 steps 2 and 5, C1, D2, R1, R2; UC-CLI-02; W-03; C-029, FPR-06; SP-01, SP-03; AT-CLI-005, AT-CLI-006; Q-066 interim

## What was built

On the consultation page the doctor writes the note: chief complaint, history, examination, assessment and advice as free text, plus allergies as **Known allergies** (with the list), **No known allergies** or **Not asked**. The draft autosaves two seconds after the doctor stops typing and shows "Draft saved hh:mm:ss", so a crashed browser loses nothing. **Sign** (or Ctrl+Enter) saves what is pending, then signs. The note becomes version 1, the consultation moves to **Done** on the worklist, and the form gives way to the signed view. **Amend** asks for a reason, opens a draft from the signed text, and signs as version 2, marked "Amended" with its reason. Version 1 stays readable under "Earlier versions". An unsigned draft can be discarded; discarding an amendment leaves the signed note as it was.

## Files

| File                                                                                                          | Purpose                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261116110000_clinical_document/migration.sql`                          | `clinical_document` (one per consultation, the draft, CHECKs on the state) and `clinical_document_version` (immutable, `amends_version_id` and reason), RLS, grants |
| `packages/database/prisma/schema.prisma`, `src/index.ts`                                                      | `ClinicalDocument`, `ClinicalDocumentVersion`; `DbNull` exported for clearing a JSON column                                                                         |
| `packages/contracts/src/consultation-notes.ts`                                                                | Note content (sections and allergy tri-state), draft, sign, amend and discard requests, the note answer                                                             |
| `packages/mod-clinical/src/domain/consultation-note.ts` (+ spec)                                              | Note status, and when a draft may be saved, signed, amended or discarded                                                                                            |
| `packages/mod-clinical/src/infrastructure/clinical-document.repository.ts`                                    | Note rows, version-checked updates, signed versions, consultation to CONSULTED                                                                                      |
| `packages/mod-clinical/src/application/consultation-note.service.ts`, `http/consultation-notes.controller.ts` | `GET /consultations/{id}/note`, `PUT .../draft`, `POST .../sign`, `.../amend`, `.../discard`                                                                        |
| `apps/api/src/worklist.api.spec.ts`                                                                           | 6 note tests next to the worklist ones (same hospital setup)                                                                                                        |
| `apps/web/src/api/consultation-notes.ts`                                                                      | Note client                                                                                                                                                         |
| `apps/web/src/components/consultation/*`                                                                      | Form rules (+ test), labels, editor with autosave, signed view, amend dialog, panel                                                                                 |
| `apps/web/app/(app)/consultations/[consultationId]/page.tsx`                                                  | The note on the consultation screen                                                                                                                                 |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                                | `note.*` texts                                                                                                                                                      |
| `apps/web/e2e/worklist.spec.ts`, `support/mock-worklist.ts`                                                   | 2 note browser tests; the mock keeps drafts and versions                                                                                                            |

## Decisions applied

- **Q-066 interim:** free-text sections, the allergy tri-state, no coded diagnosis and no vital signs. An empty form is "Not asked", never "No known allergies" (FR-CLI-007). Known allergies need at least one listed.
- **Draft and versions are separate tables.** The draft lives on `clinical_document` and is overwritten by each autosave. Each signature appends a `clinical_document_version` row, and the app has no UPDATE or DELETE on that table (FPR-06). The CHECKs make v1 amend nothing and every later version amend one, with a reason.
- **Only the consultation's doctor** reads or writes the note (the practitioner linked to the account), so a draft is seen by its author only (UC-CLI-01 C1); another doctor's request is NOT_FOUND. Saving a draft needs `clinical.consultation.record`, signing `clinical.document.sign`, amending `clinical.document.amend` (C00 section 8). A role without sign can draft and discard but not sign (UC-CLI-01 D2).
- **Every command checks the note's version** (SP-03) in an `UPDATE ... WHERE version` that locks the row. The first save sends 0, and two first saves at once end in one note and STALE_RECORD. Sign also signs whatever is pending: the editor saves first, one save at a time.
- **Audit:** signing (`clinical.note.signed`, outbox `ConsultationSigned`), starting an amendment and discarding a draft are audited, with IDs and version numbers only, never the text. Autosaves are not audited: a draft is not a record, and auditing every few seconds would drown the trail.
- **Signing at least one section** is required; an empty note cannot be signed.
- **Bangla "Advice" is উপদেশ**, so it does not read like পরামর্শ (consultation) in the section title.

## Verification

| Command                                                | Result                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @hms/database db:deploy` (local Docker) | Applied after one fix: the self-referencing foreign key on `clinical_document_version` now comes after its unique index (the first try failed with 42830 and was rolled back locally; Supabase never saw it)                                                                                                                    |
| `vitest run src/domain` (clinical)                     | 17 of 17 (7 new note rules)                                                                                                                                                                                                                                                                                                     |
| `vitest run src/worklist.api.spec.ts` (api)            | 13 of 13; note: drafts and v1 with CONSULTED, edit after sign INVALID_TRANSITION (AT-CLI-005), amend with a reason as v2 linked to v1 with v1 unchanged (AT-CLI-006), discard of a first draft and of an amendment, stale draft and empty sign, no sign permission 403 and another doctor 404, no UPDATE or DELETE on a version |
| `vitest run src/components/consultation` (web)         | 5 of 5                                                                                                                                                                                                                                                                                                                          |
| `playwright test e2e/worklist.spec.ts`                 | 6 of 6, axe clean: autosave, Ctrl+Enter sign, amend to v2 with earlier versions; draft without sign permission, then discard                                                                                                                                                                                                    |
| `playwright test` (all)                                | 78 of 78; `admin.spec.ts` "edits a role" again timed out once on the dev server's first compile and passed on rerun                                                                                                                                                                                                             |
| `pnpm turbo run build lint typecheck`                  | 55 of 55                                                                                                                                                                                                                                                                                                                        |
| `pnpm boundaries:check`                                | No violations                                                                                                                                                                                                                                                                                                                   |
| `pnpm turbo run test` (with `.env`)                    | 33 of 33 tasks; api 227, web 80, clinical 17                                                                                                                                                                                                                                                                                    |

## Known limitations

- **Content is the Q-066 interim:** no diagnosis coding, no vital signs; the medical director's answer may add fields (a new contract version and a migration of the JSON).
- **Parking a patient** (UC-CLI-01 C1, back to WAITING) is not built; an unsigned consultation stays In consultation.
- **No print** of the note yet; prescription and orders come with T-CLI-03 and T-ORD-01.
- **A non-author amendment** (another doctor with the amend permission) is not offered; only the consultation's doctor amends.
- **Bangla texts** need the native-speaker review of terms (A1, Q-050).
- **Supabase:** the owner applied `20261116110000_clinical_document` on 2026-11-16 from `feat/CLI-consultation` (`prisma migrate status` showed exactly this one pending, then up to date, 35 migrations).

Deploy impact: one expand-only migration (`20261116110000_clinical_document`: two new tables). No new variable, service or build step.

## How to debug

- **"Draft saved" never shows:** the network tab should show `PUT /consultations/{id}/note/draft` two seconds after typing stops; a 409 STALE_RECORD means another window saved first (reload). Known allergies with an empty list are not saved until one is listed.
- **Sign stays disabled:** no section is written, known allergies have no item, or the role lacks `clinical.document.sign` (the screen says so).
- **What was signed:** `SELECT version_no, signed_at, amend_reason, content FROM hms.clinical_document_version v JOIN hms.clinical_document d ON d.id = v.document_id WHERE d.consultation_id = '<id>' ORDER BY version_no`.
- **The audit trail** has `clinical.note.signed`, `clinical.note.amendment_started` and `clinical.note.draft_discarded` with the consultation ID.
