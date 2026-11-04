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
- **Search is more forgiving than duplicate matching** (similarity 0.3 against 0.4), so a misspelt name is still found.
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

## Known limitations

- **Name search misses NFR-PERF-001 at pilot volume** (above). It is correct, only slow. The options change how ADR-003 is applied to this one query, so they are an owner decision, recorded with the options in the feature's pull request. Phone and MRN search, the most common at the desk, are fast.
- **The MRN number part** scans the hospital's rows (110 ms at 600,000); fine now, an index on the reversed MRN if it grows.
- **A common name with tens of thousands of matches** ranks all of them before taking 20, so even with an index it is near the budget (392 ms). A GiST index with `<->` ordering would avoid that, if the decision above allows indexes.
- **No search screen yet;** it comes later in this feature.

Deploy impact: none beyond T-PAT-01 (no migration, no new variable).

## How to debug

A term found the wrong way: check `matchedBy` in the response, then `searchTermOf` in `domain/search-term.ts`. A slow name search: `EXPLAIN` it as `hms_app` with `app.tenant_id` set; a `Seq Scan on patient` is the RLS limitation above, not a missing index. The volume scripts used for the table are described in this entry; the data was removed after the run.
