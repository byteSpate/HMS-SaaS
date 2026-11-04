# T-PAT-02: patient search

- **Date:** 2026-11-04
- **Commit:** this commit (feature branch `feat/PAT-patient-registry`)
- **Implements:** T-PAT-02; UC-PAT-01 step 1; FR-PAT-003, FR-PAT-010, FR-I18N-003; AT-PAT-007; NFR-PERF-001 (measured, not met for names)

## What was built

`POST /api/v1/patients/search` with `{ term }` (permission `patient.record.search`) finds patients from one box. The term is read in this order: a Bangladesh mobile number in any spelling (`01700-000001`, `+880 1700 000001`, Bangla digits); an MRN in any case (`smh-000123`); other digits as the number part of an MRN (`123` finds `SMH-000123`); anything else as a name in Bangla or English, matched by "contains" and by trigram similarity, so misspellings are found. Up to 20 rows come back, closest first, with the banner fields (FR-PAT-010): both names, MRN, sex, phone, identity status, and the age in whole years on the hospital's date, flagged `ageEstimated` when it comes from a reported age. The response says how the term was read (`matchedBy`).

The request scope and the hospital's date moved to `application/context.ts`, shared by registration and search.

## Files

| File                                                                                   | Purpose                                 |
| -------------------------------------------------------------------------------------- | --------------------------------------- |
| `packages/contracts/src/patients.ts`                                                   | Search request, summary and response    |
| `packages/mod-patients/src/domain/search-term.ts`, `age.ts`                            | How a term is read; the banner age      |
| `packages/mod-patients/src/infrastructure/patient-search.repository.ts`                | The queries                             |
| `packages/mod-patients/src/application/patient-search.service.ts`                      | The use case                            |
| `packages/mod-patients/src/application/context.ts`                                     | Request scope and hospital date, shared |
| `packages/mod-patients/src/http/patients.controller.ts`, `patients.module.ts`          | Route and wiring                        |
| `packages/mod-patients/src/domain/search.spec.ts`, `apps/api/src/patients.api.spec.ts` | 10 domain tests, 7 API tests            |

## Decisions applied

- **POST, not GET,** like the candidate lookup: a name or phone number never sits in a URL or request log.
- **A mobile number is tried before an MRN,** because `01700-000001` also has the shape of an MRN with a digit prefix. A real MRN is never a valid mobile number.
- **Names are matched by word similarity** (at least 0.4), so a part of a name (`kar`) or a misspelling (`Kareem Ahmd`) finds `Karim Ahmed`, while `Rahim` does not (0.17). Names need at least 3 letters.
- **Phone in full in results:** the banner shows it (F section 3), and search needs only `patient.record.search`, which every clinical role has.

## Verification

| Command                                                  | Result                                  |
| -------------------------------------------------------- | --------------------------------------- |
| `vitest run src/patients.api.spec.ts`, first run         | 1 failed: `01700-000001` read as an MRN |
| Same, after trying a mobile number first                 | 17 of 17                                |
| `vitest run` in `mod-patients`                           | 23 of 23                                |
| `vitest run` in `apps/api`                               | 16 files, 125 tests                     |
| `pnpm turbo run lint typecheck`, `pnpm boundaries:check` | Clean                                   |

### Volume check (M section 6, NFR-PERF-001: p95 at most 500 ms)

600,000 synthetic patients in a throwaway local hospital, 40 x 40 common names (worst case for names), `EXPLAIN (ANALYZE, BUFFERS)` as `hms_app` with RLS on:

| Query                                 | Plan                         | Time             |
| ------------------------------------- | ---------------------------- | ---------------- |
| Phone                                 | Index scan (tenant, phone)   | 0.2 ms           |
| MRN                                   | Index scan (tenant, mrn)     | 0.2 ms           |
| MRN number part (`LIKE '%-123456'`)   | Sequential scan              | 110 ms           |
| Duplicate candidates (T-PAT-01)       | Bitmap: phone and birth year | 111 ms           |
| Name, common full name                | **Sequential scan**          | **6.6 s**        |
| Name, two letters / misspelt / Bangla | **Sequential scan**          | **3.1 to 3.5 s** |

The same common-name query as `postgres`, which bypasses RLS, uses both GIN trigram indexes and takes 392 ms. The cause: `similarity_op` (`%`) and `texticlike` (`ILIKE`) are not leakproof, and PostgreSQL never uses a non-leakproof operator as an index condition under row-level security.

### Follow-up: name search through a secure function (owner decision 2026-11-04)

The owner chose a secure search function over leaving it slow. Migration `20261104100000_patient_name_search`:

- `hms.search_patients_by_name(text)`, `SECURITY DEFINER`, owned by `hms_migrator`, executable only by `hms_app`. It filters on `hms.current_tenant_id()` itself and takes no hospital parameter, so it returns nothing without a hospital in the session and never another hospital's patients. A test checks all three cases.
- A read-only policy `patient_search_read FOR SELECT TO hms_migrator`, the same pattern as `hms.user_belongs_elsewhere()` (20261102090000). `hms_app` still sees only its hospital through RLS.
- GiST trigram indexes replace the GIN ones, for nearest-first ordering (`<<->`): a common name reads 20 rows instead of ranking every match. The term's script picks the column, since across scripts the similarity is always 0.

Same 600,000 patients, as `hms_app`:

| Name searched                   | Before | After  |
| ------------------------------- | ------ | ------ |
| `Karim Ahmed` (30,000 share it) | 6.6 s  | 11 ms  |
| `Nazma`                         | 3 s+   | 4 ms   |
| `kar` (part of a name)          | 3.1 s  | 15 ms  |
| `Abul` (for Abdul)              | 3 s+   | 14 ms  |
| `করিম` (Bangla)                 | 3.5 s  | 7 ms   |
| No match                        | 3 s+   | 10 ms  |
| `Kareem Ahmd` (misspelt)        | 3.5 s  | 559 ms |

The migration built the GiST indexes on 600,000 rows in 39 s. After the change: lint and typecheck 41 of 41, all 26 test tasks (API 126, database 28 with the RLS coverage check, mod-patients 23).

## Known limitations

- **A misspelt full name of a very common name** stays near 560 ms: right at the 0.4 threshold the index has to read far before it finds 20. It is the tail of NFR-PERF-001's p95, with synthetic data where 30,000 patients share each name; real names are more varied.
- **`hms_migrator` can read every hospital's patients** through the new policy. It could already, as the owner of the tables; the policy only makes the function work.
- **The MRN number part** scans the hospital's rows (110 ms at 600,000); fine now, an index on the reversed MRN if it grows.
- **Duplicate candidates (T-PAT-01)** still do not use the name index under RLS; they stay fast (111 ms) through the phone and birth-year indexes.
- **No search screen yet;** it comes later in this feature.

Deploy impact: migration `20261104100000_patient_name_search` (drops and rebuilds the two name indexes, adds a policy and a function; expand-only, safe while the previous version runs). No admin script and no new variable.

## How to debug

A term found the wrong way: check `matchedBy` in the response, then `searchTermOf` in `domain/search-term.ts`. A name not found: compare `hms.word_similarity(term, name)` with the 0.4 threshold set on the function. A slow name search: `EXPLAIN ANALYZE SELECT * FROM hms.search_patients_by_name('...')` as `hms_app` with `app.tenant_id` set; it should show index scans on `patient_name_en_trgm_idx` or `patient_name_bn_trgm_idx`. The volume data was loaded into a throwaway hospital and removed after each run.
