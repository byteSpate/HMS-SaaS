# T-PAT-03: NID storage, masking and audited reveal

- **Date:** 2026-11-04
- **Commit:** this commit (feature branch `feat/PAT-patient-registry`)
- **Implements:** T-PAT-03; FR-PAT-007, FR-PAT-011 (same NID), FR-AUD-003; AT-PAT-009; E section 5.2; owner decision 2026-11-04 (encrypt in the app)

## What was built

A patient's national ID (NID) can be given at registration (`nid`, any spelling: spaces, hyphens, Bangla digits). The API seals it with AES-256-GCM before it reaches the database, stores an HMAC-SHA256 lookup hash beside it, and keeps the last four digits readable. Search results show only `nidLast4` (FR-PAT-007). Searching by NID finds the patient through the hash (`matchedBy: NID`), and the same NID is now a duplicate-candidate reason (`SAME_NID`). `POST /api/v1/patients/{patientId}/nid/reveal` returns the full number to holders of `patient.sensitive.view`, with `Cache-Control: no-store`, and writes the audit event `patient.nid.revealed` in the same transaction (FR-AUD-003). Without the permission the guard refuses and audits the refusal.

The AES-256-GCM helper moved from `mod-identity-access` to `packages/platform` (`secret-box.ts`), so MFA secrets and NIDs share one implementation, with two new functions: `deriveKey` (HKDF-SHA256) and `keyedHash` (HMAC-SHA256).

## Files

| File                                                                                                        | Purpose                                                          |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261104110000_patient_identifier`                                     | `hms.patient_identifier`: ciphertext, hash, last four; RLS       |
| `packages/database/prisma/schema.prisma`                                                                    | `PatientIdentifier` model                                        |
| `packages/platform/src/secret-box.ts`, `.spec.ts`                                                           | Shared AES-256-GCM, HKDF and HMAC (moved from identity)          |
| `packages/mod-identity-access/src/application/auth.config.ts` and others                                    | `parseMfaKey` on the shared helper; old copy removed             |
| `packages/contracts/src/patients.ts`                                                                        | `nid`, `SAME_NID`, `nidLast4`, `matchedBy: NID`, reveal response |
| `packages/mod-patients/src/domain/nid.ts`, `phone.ts`, `search-term.ts`, `patient-identity.ts`              | NID rules; shared digit clean-up                                 |
| `packages/mod-patients/src/infrastructure/nid-vault.ts`                                                     | Seal, open, lookup hash                                          |
| `packages/mod-patients/src/infrastructure/patient.repository.ts`, `patient-search.repository.ts`            | Same-NID signal, insert, NID search, last four                   |
| `packages/mod-patients/src/application/nid-reveal.service.ts`                                               | Audited reveal                                                   |
| `packages/mod-patients/src/http/patients.controller.ts`, `patients.module.ts`, `apps/api/src/app.module.ts` | Route and key wiring                                             |
| `.env.example`, `.github/workflows/ci.yml`, `images.yml`, `docs/DEPLOYMENT.md`                              | `NID_ENCRYPTION_KEY`; pending-deploy rows                        |
| `packages/mod-patients/src/domain/nid.spec.ts`, `apps/api/src/patients.api.spec.ts`                         | 7 domain tests, 5 API tests                                      |

## Decisions applied

- **Owner decision: encrypt in the app** (E section 5.2 proposal). Backups and database administrators never see a raw NID.
- **Two derived keys** from one `NID_ENCRYPTION_KEY` (HKDF, versioned purposes `hms/patient-nid/encryption/v1` and `.../lookup/v1`): the hash key cannot decrypt, and a key rotation can add `v2` beside `v1`.
- **A keyed hash, not a plain one:** NIDs have few digits, so an unkeyed hash could be reversed by trying every number.
- **NID format is an assumption:** the requirements give none. Bangladesh issues 10-digit (smart card) and 13- or 17-digit (older) NIDs, so those lengths are accepted.
- **The same NID on two patients is allowed** and shown as a candidate, never refused or merged (FR-PAT-001, Q-036).
- **No reason is asked for a reveal:** FR-AUD-003 requires the audit, not a reason.
- **The required key stops the API at start when missing,** like `MFA_ENCRYPTION_KEY`, so a server can never store NIDs unsealed.

## Verification

| Command                                             | Result                                                     |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `vitest run` in `mod-patients`                      | 30 of 30 (7 new)                                           |
| `vitest run src/patients.api.spec.ts`               | 23 of 23 (5 new); written after the code, passed first run |
| `vitest run` MFA crypto and MFA service in identity | 15 of 15 after the move                                    |
| `pnpm turbo run lint typecheck`                     | 41 of 41                                                   |
| `pnpm boundaries:check`                             | No violations                                              |
| `pnpm turbo run test --concurrency=1`               | 26 of 26 tasks; API 131, platform 53, identity 82          |

## Known limitations

- **The NID cannot be corrected yet:** that is an identity edit (T-PAT-04), which will grant the needed column.
- **One NID per patient;** birth registration and passport numbers fit the same table (`kind`) but have no route yet.
- **No key rotation tool:** changing `NID_ENCRYPTION_KEY` makes stored NIDs unreadable. Rotation needs a re-encryption job, not built.
- **A one-dash NID such as `1234-567890`** is read by search as an MRN with a digit prefix; typed without that single dash it is found.
- **No screen yet** for the reveal; it comes with the patient screens of this feature.

Deploy impact: **new required variable `NID_ENCRYPTION_KEY`** (32 bytes base64, `openssl rand -base64 32`, once per installation; never change it); migration `20261104110000_patient_identifier` (new table, expand-only). Both are in the DEPLOYMENT.md pending table. CI and the image smoke test set a CI-only value.

## How to debug

`NID_ENCRYPTION_KEY must be 32 bytes in base64` at start: the variable is missing or wrong. A reveal that fails with an authentication error from GCM: the key changed since the NID was stored. NID search finds nothing for a known patient: check that the number normalizes to the same digits (`normalizedNid`) and that the key is the one used at registration. A `403` on reveal: the user lacks `patient.sensitive.view`; the refusal is in the audit as `authz.access.denied`.

**CI fix (PR #53, 2026-11-05):** the first CI run failed `route-markers.spec.ts` and `swagger.spec.ts` in `@hms/api` with `NID_ENCRYPTION_KEY must be 32 bytes in base64`. CI set the variable, but turbo's strict env mode passes a task only the variables in its `passThroughEnv`, and `turbo.json` listed `MFA_ENCRYPTION_KEY` but not `NID_ENCRYPTION_KEY`. Locally the tests read the root `.env` through `apps/api/vitest.config.ts`, so the gap did not show. A new variable that the API reads at start must be added in three places: `.env.example`, `ci.yml` and `turbo.json` (`test.passThroughEnv`).
