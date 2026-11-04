# T-UI-03 (patient part): front desk and patient record screens

- **Date:** 2026-11-04
- **Commit:** this commit (feature branch `feat/PAT-patient-registry`)
- **Implements:** T-UI-03 for SCR-02 and SCR-03 (W-01); screens for T-PAT-01..04; FR-PAT-001, -003, -006, -007, -008, -010; F section 3 rules 5 and 6; F section 9 (search debounce)

## What was built

- **Front desk** (`/staff/patients`, menu "Front desk", needs `patient.record.search`): one search box for a phone number in any spelling, an MRN, an NID or three letters of a name, searched 250 ms after typing stops. Results show the banner fields (both names, MRN, sex and age, phone, the NID masked) and how the term matched. "New registration" appears only with `patient.record.register`.
- **Registration dialog:** the C-034 fields; birth date or age (one disables the other); "no mobile number" for a patient without one; optional NID and address. Once name, sex and birth date or age are in, possible existing patients are listed with why they match and a link to open each. When any exist, "Register" stays disabled until the receptionist ticks "None of these is the same person" (F section 3 rule 6). One Idempotency-Key per dialog; a `DUPLICATE_CANDIDATES_PRESENT` answer refreshes the list. After registering, the new patient's record opens.
- **Patient record** (`/staff/patients/{id}`): banner fields, date of birth or the age with the day it was given (never an invented date), phone, address, the NID masked. "Show NID" only with `patient.sensitive.view`, with a note that the reveal is audited; "Correct details" only with `patient.identity.edit`.
- **Correction dialog:** prefilled; sends only changed fields, a reason and the version it loaded. A `STALE_RECORD` answer shows what happened and a "Reload" button.
- The API client takes extra headers (for the Idempotency-Key). Identifiers are shown with locale digits but never grouped like amounts.

## Files

| File                                                                           | Purpose                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `apps/web/app/(app)/patients/page.tsx`, `[patientId]/page.tsx`                 | Front desk, patient record                                                |
| `apps/web/src/components/patients/*`                                           | Registration and correction dialogs, text helpers, change logic, debounce |
| `apps/web/src/api/patients.ts`, `client.ts`                                    | Patient endpoints; headers option                                         |
| `apps/web/src/navigation.ts`                                                   | "Front desk" entry                                                        |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                 | `patients.*`, `nav.patients`                                              |
| `apps/web/e2e/patients.spec.ts`, `e2e/support/mock-patients.ts`, `mock-api.ts` | 3 browser tests; contract-valid mock                                      |
| `apps/web/src/components/patients/correction-changes.test.ts`                  | 3 unit tests                                                              |

## Decisions applied

- **Buttons follow permissions** (FR-ACC-009): what the server would refuse is not offered; the API still checks every request.
- **The confirmation is per list:** changing any field clears it, so a new candidate is never covered by an earlier tick.
- **Identifiers are digits, not numbers:** `toLocaleDigits`, not `formatNumber`, which grouped a phone number as an amount (found by the browser test).
- **No `/` shortcut or Alt+Shift+N yet** (F section 4.1): the search box takes focus when the page opens.

## Verification

| Command                                                    | Result                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `playwright test e2e/patients.spec.ts`, first run          | 1 of 3; showed nested `<p>` in `Alert` and grouped phone digits                  |
| Same, after the fixes                                      | 3 of 3, axe finds no violations on the front desk                                |
| Full web e2e suite under `next dev`, beside a lint run     | 10 failures across specs, all navigation or visibility waits; machine overloaded |
| Full suite on the production build (as CI)                 | Not finished: stopped when the machine ran low on memory; CI runs it on the PR   |
| `vitest run src/components/patients`                       | 3 of 3                                                                           |
| `tsc --noEmit`, `eslint` in `apps/web`, i18n catalog tests | Clean; 29 of 29                                                                  |

## Known limitations

- **The Bangla texts** of `patients.*` need the native Bangla review owed for RG-1.
- **No keyboard shortcuts** for search and registration yet (F section 4.1, W-01).
- **No identity history view:** the history is stored (T-PAT-04) but not shown.
- **Field errors show as one message** at the top of a dialog, not on the field.
- **Locally `next dev` compiles a route on first visit,** so the spec allows 90 s per test and 20 s for the first navigation; CI uses the production build.

Deploy impact: none (screens only; the API endpoints are in the T-PAT-01..04 entries).

## How to debug

A button missing for a user: the session's `permissions` lack the code (see `useCachedSession`). Duplicates not listed: the lookup waits for name, sex and birth date or age, then 400 ms. A correction "does nothing": `changesOf` found no difference from the record.
