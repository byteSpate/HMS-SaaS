# H — Automated test plan

| Control | Value |
| --- | --- |
| Document | H Automated test plan (layers, tools, environments, test catalogue, CI evidence) |
| Version | 0.4.0-draft |
| Status | **PROPOSED.** Test IDs are stable. No test exists yet; nothing here claims a passing result. |
| Owner role | QA lead (plan); implementers write tests per task (G §4) |
| Updated | 2026-10-12 |
| Depends on | [C-srs](C-srs/C00-srs-overview.md), [D](D-system-design.md), [E](E-database-design.md), [L](L-cicd-sonarqube.md), [M](M-capacity-performance.md) |

## 1. Principles

1. **Test behavior the hospital cares about**: money totals, permissions, states, isolation. Tests do not restate implementation.
2. **Real PostgreSQL 18** for anything involving constraints, RLS, transactions or concurrency. No in-memory substitutes for the database.
3. **Synthetic data only.** Every multi-record test uses at least two tenants with overlapping identifiers (v0.3 AGENTS).
4. **Every state-changing command has five kinds of tests:**
   - positive
   - permission-denied
   - cross-tenant
   - duplicate/idempotent
   - stale/concurrent (where relevant)
5. **Determinism**: fixed clock per test (facility timezone Asia/Dhaka), seeded IDs where readability helps, and no dependence on test order.
6. **Evidence**: CI stores test reports, coverage, Playwright traces and logs for failed runs. Handoffs cite test IDs and run results.

## 2. Test layers and tools

| Layer | Scope | Tool (status) | Runs | Why this tool | Alternative |
| --- | --- | --- | --- | --- | --- |
| Static | Format, lint (incl. SonarJS rules), typecheck, boundaries, i18n catalog check, OpenAPI drift | Prettier, ESLint 10 + eslint-plugin-sonarjs, `tsc`, dependency-cruiser, custom scripts | Every PR | Fast feedback; compensates for Sonar main-only (ADR-012) | Biome (no SonarJS plugin) |
| Unit | Pure domain rules: money, allocation validation, eligibility evaluation, state machines, phone normalization, duplicate scoring, formatters | **Jest 30** (supplied; ADR-013) | Every PR (affected) | Supplied foundation | Vitest by decision (Q-054) |
| PostgreSQL integration | Repositories, constraints, RLS, roles, migrations, transactions, concurrency | Jest + real PostgreSQL 18 (GitHub Actions service container in CI; Compose locally). Testcontainers optional. | Every PR touching `packages/database` or `mod-*` infrastructure | Proves the database invariants (E §13 probes become automated tests) | — |
| API | HTTP contract, auth, CSRF, permission denial, tenant isolation, idempotency, error mapping | Jest + **Supertest** against the Nest app with a real DB | Every PR (affected) | Exercises guards, pipes, interceptors end-to-end | — |
| Contract | Zod ↔ OpenAPI drift; response validation; event schema compatibility | Custom scripts + schema diff | Every PR | Parallel UI/API agents depend on frozen contracts (ADR-005) | Pact (heavier; unnecessary within one monorepo) |
| Browser E2E | Staff journeys, keyboard-only flows, language switch, committed-state display, uncertain outcomes | **Playwright** (PROPOSED) + `@axe-core/playwright` | PR (affected journeys, Chromium); nightly (Chromium + Firefox, full) | Multi-browser, trace viewer for agent debugging, axe integration | Cypress |
| Visual / print views | Print-view HTML snapshots for receipts, reports and labels in bn/en | Playwright screenshots with a threshold (fonts self-hosted) | Nightly + on template changes | Catches layout/shaping regressions early. **Does not replace printer UAT.** | — |
| Integration adapters | Analyzer message handling with a simulator | Jest + a simulated message feed | When adapters exist | — | — |
| Load / soak | Workflow mixes and polling | **k6** (PROPOSED) | Before RG-3, then per release candidate (staging-like env) | Scriptable thresholds ([M §7](M-capacity-performance.md#7-load-test-methodology-and-measurable-targets)) | Artillery, Locust |
| Migration | Fresh apply, upgrade with data, drift, expand/contract compatibility | Prisma CLI + SQL checks in CI | Every PR with migrations; release candidates | — | — |
| Restore | Backup → restore → reconcile | Scripted drill (J RB-07) | Before RG-3/RG-4; periodically | — | — |
| Security | Dependency, secret and image scans; DAST baseline (optional) | gitleaks CLI, OSV-Scanner / `pnpm audit`, Trivy (SHA-pinned) or Grype, hadolint; optional OWASP ZAP baseline on staging | PR + nightly | NFR-SEC-004 | GitHub Advanced Security (paid) |

## 3. Test environments and isolation

| Environment | Data | Use |
| --- | --- | --- |
| Local dev | Compose PostgreSQL/Redis/S3-compatible service; testkit seeds | Developers and agents |
| CI (GitHub Actions) | Fresh PostgreSQL 18 service container per job; Redis service; migrations applied from scratch | PR and main pipelines |
| Ephemeral per-agent DBs | `hms_test_<task>` databases on a shared dev server, or local containers | Parallel agent work (G §6) |
| Staging VPS | Synthetic seeds, including volume seeds | E2E smoke, load tests, restore drills, UAT rehearsal |
| Pilot UAT environment | Synthetic plus approved de-identified data only if the owner approves (AS-009) | UAT ([I](I-manual-test-uat-plan.md)) |

**Isolation techniques:**
- **Per-test transaction rollback** for repository tests where possible. Tests that need commits (concurrency, outbox) use **per-suite databases** created from a migrated template (`CREATE DATABASE … TEMPLATE hms_template`) for speed.
- Jest workers each get their own database (`hms_test_w${JEST_WORKER_ID}`).
- Redis: a separate logical DB or key prefix per worker. BullMQ queues are named with a worker suffix.
- Object storage: a bucket prefix per run, cleaned after.
- **Clock:** an injected `Clock` (domain-kernel) fixed per test. Facility timezone tests cover midnight Asia/Dhaka boundaries (AT-TIME-*).

## 4. Permission denial and cross-tenant isolation

**Approach:** a generated **permission matrix test**.
- For every command endpoint in the contracts catalogue, call it as a user **lacking** the required permission and expect `403 PERMISSION_DENIED`, an audit event for sensitive actions, and no state change.
- Call it with a user who **has** the permission but belongs to tenant B, targeting tenant A's record, and expect `404 NOT_FOUND` and no change.

This catches new endpoints that lack guards.

**Isolation suite (AT-ISO-*)** runs with two tenants seeded with identical MRNs, invoice numbers, names and specimen numbers.

## 5. Financial calculations and payment allocation

- **Unit (property-based where useful):**
  - `Money` arithmetic never uses floats
  - allocation sums equal payment amounts
  - eligibility is computed from allocations and the policy version
  - invoice totals equal the sum of active lines
  - medicine/non-medicine subtotals
- **Integration:** every money command writes balanced projections. The nightly reconciliation queries (D §9.5) are also executed in tests after each scenario.
- **Fixtures:** the canonical synthetic visit V with D = 500.00 and S = {CBC 300.00, X-ray 700.00}; an IPD admission with charges 12,500.00 and payments 5,000.00 + 3,000.00.

## 6. Concurrency: stock, beds, payments, slots, numbers

**Technique:**
1. Open N separate connections (or API requests) with a start barrier (`Promise.all` after a shared latch).
2. Run conflicting commands.
3. Assert exactly the expected number of successes and the correct error codes for the losers.
4. Assert that the final state satisfies the invariants.
5. Repeat 20× per CI run to surface timing issues.

The two-session database probes in E §13 (races C1, C2) are the seed for these tests.

## 7. Contract testing

- **Drift:** regenerate OpenAPI from Zod; `git diff --exit-code` on the committed file.
- **Response conformance:** API tests validate every response body with the response schema (development/test mode only).
- **Compatibility:** compare the current schema against the last released schema with a JSON-schema diff. Removing fields, narrowing types or adding required request fields fails unless the endpoint version is bumped.
- **Events:** each event type has a JSON schema snapshot. Consumer tests run against recorded sample events for every supported `schemaVersion`.

## 8. Synthetic fixtures (packages/testkit)

| Fixture | Content |
| --- | --- |
| `twoTenants()` | Alpha Hospital and Beta Clinic, one facility each; identical MRN `MRN-000123` in both; overlapping invoice and specimen numbers |
| `roles()` | All proposed role templates (C01 §5) with one user each per tenant, plus a multi-tenant user |
| `opdVisit()` | Checked-in visit with D and S as in §5 |
| `labCase()` | CBC order, collected specimen, entered result with range version RV-3 |
| `ipdCase()` | Admission, beds W3-07/W4-02, running account |
| `stockCase()` | Store, item, batch with 5 units, expired batch |
| `volume(seed, sizes)` | Deterministic generator for load tests (e.g., 1M patients, 5M visits per large tenant) |

Names, phones and NIDs are clearly synthetic (e.g., phone prefix `01700000…`). No real records ever appear in fixtures, prompts or logs.

## 9. Migration testing

| Test | What |
| --- | --- |
| AT-DB-001 | RLS coverage query (E §6.3) returns no rows after all migrations |
| AT-DB-006 (migration) | Apply all migrations to an empty DB; `prisma migrate diff` between the schema and the DB shows no drift |
| AT-DB-007 (migration) | **Upgrade with data:** restore the previous release's seeded snapshot, apply the new migrations, and run the smoke API tests from both the old and the new app version against it (expand/contract compatibility) |
| AT-DB-008 (migration) | Backfill jobs are resumable: kill mid-run, restart, verify no duplicates and complete coverage |

## 10. Duplicates, retries, callbacks and uncertain outcomes

- **Idempotency** (AT-PLT-*):
  - same key and payload replays
  - different payload is rejected
  - a concurrent duplicate while in progress
  - expiry behavior
- **Uncertain outcome** (AT-E2E-003): a Playwright test intercepts the payment response (network abort after the server commits). The UI must show "Checking…", resolve to "Saved" via `GET /operations/{key}`, and never offer "Pay again".
- **Job retries** (AT-JOB-*):
  - relay crash between enqueue and mark-published → duplicate job ignored by `jobId` / inbox
  - Redis flush → republish from outbox
  - stalled job recovery
  - poison message → `UnrecoverableError` → failed set + alert
- **Graceful shutdown** (AT-JOB-006): SIGTERM during an active job → the job completes or is retried, with no duplicate effect.
- **Gateway callbacks** (future, when Q-045 is answered): signature failure rejected; duplicate callback → one confirmation; `UNKNOWN` → status inquiry, never a second charge.

## 11. Security tests (selected)

- CSRF: a state-changing request without or with a wrong `X-CSRF-Token` → 403.
- Session fixation: the session ID rotates at login and tenant switch.
- Cookie flags: `HttpOnly`, `Secure`, `SameSite`.
- Brute force: lockout and rate limit (AT-ACC-006/007).
- Injection: free-text fields with SQL/HTML payloads are stored verbatim and rendered escaped.
- Export/file access: presigned URL expiry; another tenant's object key → 404.
- Log redaction: NID, cookie and password are absent from logs (T-PLT-06).
- Next.js: no Server Actions in `apps/web` outside the allow-list (lint).

## 12. Laboratory release/version/status regression set

AT-LAB-001..005 encode the source complaints SRC-L12..L15 as permanent regressions. They run on every PR touching `mod-lab`, `apps/web` lab routes or print templates.

## 13. CI execution and evidence

| Pipeline stage | Tests | Evidence stored |
| --- | --- | --- |
| PR: static | Lint, typecheck, boundaries, i18n, contract drift | Logs |
| PR: unit + integration + API (affected packages via `turbo --affected`) | AT-* for touched modules + **always** AT-ISO-001..012, AT-DB-001 | JUnit XML, LCOV, test DB logs |
| PR: E2E (affected journeys, Chromium) | AT-E2E-*, AT-I18N-* | Playwright HTML report, traces on failure |
| PR: migration | AT-DB-006, -007 when migrations change | Logs |
| main | Full unit/integration/API + Sonar analysis | Sonar dashboard link, coverage |
| Nightly | Full E2E (Chromium + Firefox), visual print snapshots, security scans, reconciliation queries on staging | Reports archived 30 days (PROPOSED) |
| Release candidate | k6 smoke load on staging, restore drill (scheduled), migration upgrade test | k6 summary, drill record |

A task's handoff lists the test IDs it added and the CI run link. The traceability register ([N](N-traceability-readiness.md)) records the test IDs per requirement. **A requirement is "verified" only when its tests ran green on `main`.**

## 14. Test case catalogue

Layer key:
- **U**: unit
- **I**: PostgreSQL integration
- **A**: API
- **E**: browser E2E
- **C**: concurrency
- **J**: job/worker
- **S**: security

### 14.1 Platform, access, isolation

| ID | Req. | Layer | Scenario → expected |
| --- | --- | --- | --- |
| AT-ISO-001 | NFR-ISO-001, FR-SAA-001 | I,C | 200 concurrent `withTenant` calls alternating Alpha/Beta → each sees only its own rows |
| AT-ISO-002 | NFR-ISO-001 | I | Error inside a transaction, then a context-less query on the reused connection → 0 rows; insert fails |
| AT-ISO-003 | NFR-ISO-001 | A | Beta user GETs Alpha patient ID → 404, no existence hint |
| AT-ISO-004 | NFR-ISO-001 | A | Beta user POSTs a payment to an Alpha invoice → 404, no change |
| AT-ISO-005 | NFR-ISO-001 | A | Search MRN-000123 as Alpha and as Beta → one different result each |
| AT-ISO-006 | NFR-ISO-001 | J | Job payload with Alpha tenant processes only Alpha data; tampered tenant ID → no rows / failure |
| AT-ISO-007 | NFR-ISO-001 | I | Cache keys include tenant; Alpha cache entry never served to Beta |
| AT-ISO-008 | FR-REP-004 | A | Alpha export file contains only Alpha rows; Beta presigned URL request for Alpha object → 404 |
| AT-ISO-009 | NFR-ISO-001 | A | Permission matrix generator: every command denies wrong tenant (§4) |
| AT-ISO-010 | NFR-ISO-001 | I | `hms_relay`/`hms_control` cannot read business tables (E probes P23/P24 automated) |
| AT-ISO-011 | FR-ACC-002 | E | Switch tenant in UI → client caches cleared, no Alpha data visible in Beta session |
| AT-ISO-012 | NFR-ISO-001 | I | Logs/audit queries scoped; audit search as Beta never returns Alpha events |
| AT-SAA-001 | FR-SAA-002 | A | Provisioning retried with the same key → one tenant; a failed step resumes |
| AT-SAA-002 | FR-SAA-004 | A | Entitled module but missing permission → 403; permission but no entitlement → 403 `ENTITLEMENT_MISSING` |
| AT-ACC-001 | FR-ACC-001 | A | Valid login → session cookie (HttpOnly, Secure, SameSite), audit `auth.login.succeeded` |
| AT-ACC-002 | FR-ACC-001 | A | Wrong password → generic error, counter +1, audit failed |
| AT-ACC-003 | FR-ACC-002 | A | Multi-tenant user must select a membership; requests before selection → 403 |
| AT-ACC-004 | FR-ACC-009 | S | State-changing request without the CSRF token → 403 |
| AT-ACC-005 | FR-ACC-005 | A,E | Expired session → 401; re-login succeeds without admin; form data retained (E) |
| AT-ACC-006 | FR-ACC-004 | A | N failures → `ACCOUNT_LOCKED` with unlock time; reason visible to admin API |
| AT-ACC-007 | NFR-SEC-005 | S | Login rate limit per IP and account → 429 |
| AT-ACC-008 | FR-SUP-003 | A | Support diagnostics shows lock cause and time without clinical data |
| AT-ACC-009 | FR-ACC-006 | A | Privileged role without TOTP → step-up required; valid TOTP → access |
| AT-ACC-010 | FR-ACC-006 | A | TOTP replay or invalid code → rejected; recovery code single use |
| AT-ACC-011 | FR-ACC-010 | A | Revoke membership → next request 401; sessions invalidated |
| AT-AUD-001 | NFR-AUD-001 | A | Catalogue test: every sensitive permission's command emits an audit event |
| AT-AUD-002 | FR-AUD-002 | A | Denied sensitive attempt audited with code |
| AT-AUD-003 | FR-AUD-003 | A | NID reveal and export audited |
| AT-AUD-004 | FR-AUD-004 | I | `hms_app` UPDATE/DELETE on `audit_event` → denied |
| AT-AUD-005 | FR-AUD-005 | A | Audit search filters work; paginated; tenant-scoped |
| AT-AUD-006 | FR-AUD-006 | S | Log capture during registration/payment contains no NID, name+clinical text, cookie or password |
| AT-CFG-001 | FR-CFG-002 | A | Publish a future-effective price list → old price used until the effective time, new after (fixed clock) |
| AT-CFG-002 | FR-SAA-005 | I | Charge keeps `price_list_version_id`; republishing does not change existing charges |
| AT-CFG-003 | FR-CFG-002 | A | Publishing with a past effective time → 422; audit of the successful publish |
| AT-SUP-001 | FR-SUP-001 | A | Vendor without a grant → cannot read patient |
| AT-SUP-002 | FR-SUP-001 | A | Approved grant → read-only access, every read audited with grant ID; writes denied |
| AT-SUP-003 | FR-SUP-001 | A | Revoked/expired grant → access ends at the next request |
| AT-I18N-001 | FR-I18N-001 | E | Switch language mid-form → labels change, input preserved, preference persisted |
| AT-I18N-002 | FR-I18N-002 | U | Catalog check fails on a missing `bn-BD` key |
| AT-I18N-003 | FR-I18N-003 | I | Bangla name search matches NFC/NFD variants of the same text |
| AT-I18N-004 | FR-I18N-005 | U | Formatter renders Bangla digits when configured; stored values unchanged |
| AT-I18N-005 | FR-I18N-006 | A | Missing Bangla service name falls back to English with an admin marker |
| AT-TIME-001 | NFR-TIME-001 | U | Business date for 2026-11-02T18:30Z is 2026-11-03 in Asia/Dhaka |
| AT-TIME-002 | NFR-TIME-001 | I | Cash-day report boundaries at 00:00 Asia/Dhaka include/exclude payments correctly |
| AT-TIME-003 | NFR-TIME-001 | U | Session dates and expiry computed in the facility timezone regardless of server TZ |
| AT-PLT-001 | FPR-08 | A | Same key + payload → same response, header `Idempotent-Replay: true`, one effect |
| AT-PLT-002 | SP-02 | A | Same key, different payload → 409 `IDEMPOTENCY_KEY_REUSED` |
| AT-PLT-003 | SP-08 | A | Concurrent duplicates while in progress → one effect; `/operations/{key}` resolves |
| AT-PLT-004 | FPR-08 | J | Expired idempotency records purged; a key after expiry is treated as new (documented) |
| AT-JOB-001 | ADR-006 | J | Relay crash after enqueue before mark → re-enqueue ignored (`jobId`) or deduplicated (inbox) |
| AT-JOB-002 | ADR-006 | J | Redis flushed → republish from outbox → consumers process once |
| AT-JOB-003 | FR-REP-005 | J | Report job for a large range runs in the background; interactive API latency unaffected (smoke) |
| AT-JOB-004 | FR-PRN-006 | J | `LabResultReleased` → PDF rendered once, stored with hash; retry after renderer failure succeeds |
| AT-JOB-005 | ADR-006 | J | Poison job → `UnrecoverableError`, kept in the failed set, alert metric incremented |
| AT-JOB-006 | NFR-REL-002 | J | SIGTERM during a job → completes or retries; no duplicate side effect |
| AT-DB-001 | NFR-ISO-001 | I | RLS coverage query returns no tables |
| AT-DB-002 | ADR-009 | I | `hms_app` UPDATE on payment/charge/result_version/stock_movement → denied |
| AT-DB-003 | FR-IPD-007 | I,C | Exclusion constraint race on the same bed (E race C1) |
| AT-DB-004 | FR-INV-003 | I,C | Concurrent decrement below zero rejected (`stock_balance_non_negative`) |
| AT-DB-005 | NFR-ISO-001 | I | Composite FK prevents a cross-tenant parent reference |

### 14.2 Patients, scheduling, visits

| ID | Req. | Layer | Scenario → expected |
| --- | --- | --- | --- |
| AT-PAT-001 | FR-PAT-001 | A | Registration with a same-phone candidate and no confirmation → 422 `DUPLICATE_CANDIDATES_PRESENT` |
| AT-PAT-002 | FR-PAT-001 | A | With confirmation → created; audit lists the shown candidate IDs |
| AT-PAT-003 | FR-PAT-011 | U | Duplicate scoring returns reasons (phone, name+sex+age, NID) deterministically |
| AT-PAT-004 | FR-PAT-001 | E | Keyboard-only search → select existing → no new patient |
| AT-PAT-005 | FR-PAT-002 | A,C | Same key twice / concurrent → one patient, one MRN |
| AT-PAT-006 | FR-PAT-006 | A | Age-only registration stores reported age; no fabricated birth date |
| AT-PAT-007 | FR-PAT-003 | U,I | `01700-000001`, `+880 1700 000001`, `০১৭০০০০০০০১` → same normalized phone → same patient |
| AT-PAT-008 | FR-PAT-004 | A | Temporary identity registration with minimal fields; banner flag |
| AT-PAT-009 | FR-PAT-007 | A | NID masked in responses; reveal needs permission and is audited |
| AT-PAT-010 | FR-PAT-008 | A | Identity edit requires a reason; history row stores previous values; MRN immutable |
| AT-PRA-001 | FR-PRA-001, -002 | A | Two practitioners with the same name allowed; a new practitioner appears in the picker immediately (cache invalidated) |
| AT-SCH-001 | FR-SCH-002 | A | Create/publish a session; past session rejected |
| AT-SCH-002 | FR-SCH-001 | A | Booking creates no visit/invoice |
| AT-SCH-003 | FR-SCH-003 | C | Last-slot race → one success, one `CAPACITY_FULL` |
| AT-SCH-004 | FR-SCH-002 | A | Reschedule → old `RESCHEDULED`, new `BOOKED`, linked; capacity moved |
| AT-SCH-005 | FR-SCH-002 | A | Cancel with reason → capacity released; check-in of a cancelled appointment → 409 |
| AT-SCH-006 | FR-SCH-005 | A | No-show marking after session end; no visit created |
| AT-VIS-001 | FR-VIS-002 | A | Check-in → visit + queue number + doctor-fee invoice in one transaction |
| AT-VIS-002 | FR-VIS-002 | C | Double check-in (same key / concurrent) → one visit |
| AT-VIS-003 | FR-BIL-010 | A | No doctor fee configured → visit created, `POLICY_NOT_CONFIGURED` flag, no invoice |
| AT-VIS-004 | FR-VIS-001 | A | Diagnostic visit without consultation; no doctor-fee invoice |
| AT-VIS-005 | FR-ORD-001 | A | Not directly orderable test at reception → 403 `TEST_NOT_DIRECTLY_ORDERABLE` |

### 14.3 Clinical and orders

| ID | Req. | Layer | Scenario → expected |
| --- | --- | --- | --- |
| AT-CLI-001 | FR-CLI-001 | I | Signing a prescription creates no stock movement or pharmacy charge |
| AT-CLI-002 | FR-CLI-006 | A | `EXTERNAL` fulfilment line never creates a dispense request |
| AT-CLI-003 | FR-CLI-002 | A | Worklist statuses follow doctor-fee eligibility |
| AT-CLI-004 | FR-CLI-002 | A | Start consultation with an ineligible doctor fee → 409 `PAYMENT_NOT_ELIGIBLE` |
| AT-CLI-005 | FR-CLI-003 | A | Sign → v1; edit after sign is impossible without amend |
| AT-CLI-006 | FR-CLI-003 | A | Amend with a reason → v2 linked to v1; v1 readable |
| AT-ORD-001 | FR-ORD-002 | A | Requester taken from the session; a client-supplied requester is ignored |
| AT-ORD-002 | FR-ORD-003 | I | Order creates exactly one charge and service-invoice line in the same transaction |
| AT-ORD-003 | FR-ORD-005 | A | Paid doctor fee does not make new orders eligible |
| AT-ORD-004 | FR-ORD-004 | U | Order state machine rejects illegal transitions |
| AT-ORD-005 | FR-BIL-009 | A | Second order on the same visit appends to the existing service invoice |
| AT-ORD-006 | FR-ORD-007 | A | Expected report time from configuration appears on the order slip data |
| AT-ORD-007 | FR-ORD-006 | A | Cancel an unpaid order → order and line cancelled; totals reduced; history kept |
| AT-ORD-008 | FR-ORD-006 | A | Cancel after allocation → 409 `FEATURE_NOT_AVAILABLE` |

### 14.4 Billing

| ID | Req. | Layer | Scenario → expected |
| --- | --- | --- | --- |
| AT-BIL-001 | FR-BIL-001 | A | Pay D 500.00 → D `PAID`; S still 1,000.00 |
| AT-BIL-002 | FR-BIL-007 | A | Client-supplied price ignored; server price list used |
| AT-BIL-003 | FR-BIL-002 | A | Doctor-only user records a payment → 403 |
| AT-BIL-004 | FR-BIL-012 | A | Allocation sum ≠ payment amount → 422 |
| AT-BIL-005 | FR-BIL-003 | A | CBC paid, X-ray not → lab collection allowed for CBC, refused for X-ray |
| AT-BIL-006 | FR-BIL-003 | A | Partial payment on a line → line stays `NOT_ELIGIBLE` under `FULL_PAYMENT` |
| AT-BIL-007 | FR-BIL-003 | A | Deposit eligibility requested while no deposit policy exists → `FEATURE_NOT_AVAILABLE` |
| AT-BIL-008 | FR-BIL-004 | A | MOBILE/bKash stored and reported as MOBILE (session totals, report) |
| AT-BIL-009 | FR-BIL-006 | I | Same source reference posted twice → one charge returned |
| AT-BIL-010 | FR-BIL-033 | A | Different content under the same source reference → `IDEMPOTENCY_KEY_REUSED` + alert |
| AT-BIL-011 | FR-BIL-011 | A | Payment replay with the same key → same receipt |
| AT-BIL-012 | SP-02 | A | Same key, different amount → 409 |
| AT-BIL-013 | FR-BIL-034 | C | Two cashiers pay the same 700.00 line concurrently → one success, one `AMOUNT_EXCEEDS_BALANCE` |
| AT-BIL-014 | FR-BIL-019 | A | Amount above the selected balance → `AMOUNT_EXCEEDS_BALANCE` |
| AT-BIL-015 | FR-BIL-025 | A | Method correction keeps the original; requires permission and a reason; reports show the marker |
| AT-BIL-016 | FR-BIL-026 | A | Second open session for the same cashier → 409; payment without a session → 409 |
| AT-BIL-017 | FR-BIL-026 | A | Close session computes expected vs counted per method; the cashier cannot review their own variance |
| AT-BIL-018 | FR-BIL-027 | A | Receipt reprint → copy number incremented, audit, no payment created |
| AT-BIL-019 | FR-BIL-028 | A | IPD running account accepts charges and interim payments; balance correct |
| AT-BIL-020 | FR-BIL-029 | A | Final bill: charges 12,500.00, payments 5,000.00 + 3,000.00 → balance 4,500.00, each payment listed once |
| AT-BIL-021 | FR-BIL-030 | U,I | Medicine and non-medicine subtotals computed independently |
| AT-BIL-022 | FR-BIL-031 | I | 10,000 synthetic invoices: summary = detail = receipts (reconciliation query) |

### 14.5 Laboratory

| ID | Req. | Layer | Scenario → expected |
| --- | --- | --- | --- |
| AT-LAB-001 | FR-LAB-002 (SRC-L12) | E | Open a released report and close it → still `RELEASED` |
| AT-LAB-002 | FR-LAB-002 (SRC-L14) | E | Print then browser Back → still `RELEASED`; print event logged |
| AT-LAB-003 | FR-LAB-002 (SRC-L15) | E | Open customize/print options, Back without saving → status unchanged |
| AT-LAB-004 | FR-LAB-002 (SRC-L13) | A | Verify an entered result → persisted `VERIFIED`; reload shows it under "to release" |
| AT-LAB-005 | FPR-07 | A | Every GET endpoint of the lab module leaves `updated_at`/status unchanged (generated) |
| AT-LAB-006 | FR-LAB-003 | I | New range version does not alter a released version or its print data |
| AT-LAB-007 | FR-LAB-016 | A | Analyzer attribute mapping applies the mapped range/method version |
| AT-LAB-008 | FR-LAB-004 | A | Collection worklist contains only eligible lines |
| AT-LAB-009 | FR-LAB-005 | A | Collect → specimen number unique, label data complete, reprint marked |
| AT-LAB-010 | FR-LAB-006 | A | Reject with reason → linked recollection created; original kept |
| AT-LAB-011 | FR-LAB-007 | A | Dispatch batch and receipt scan events recorded separately |
| AT-LAB-012 | FR-LAB-008 | U | Flag computation vs range version (H/L/critical) |
| AT-LAB-013 | FR-LAB-009 | A | Verify blocked while required values are missing |
| AT-LAB-014 | FR-LAB-010 | A | Entry-only user releases → 403; status unchanged |
| AT-LAB-015 | FR-LAB-010, CP-13 | A | Same user verifies and releases while forbidden → `SEGREGATION_OF_DUTY` |
| AT-LAB-016 | FR-LAB-011 | A | Stage skip allowed only for configured categories; recorded |
| AT-LAB-017 | FR-LAB-012 | A | Amendment → v2 released, v1 `SUPERSEDED` and viewable; print says "Amended" |
| AT-LAB-018 | FR-LAB-014 | E | Print view uses template fonts; advice not auto-bold (snapshot) |
| AT-LAB-019 | FR-LAB-019 | A | Report tests ordered by configured sequence |
| AT-LAB-020 | FR-LAB-020 | A | IPD report includes ward/room/bed at collection |
| AT-LAB-021 | FR-LAB-021 | A | Consumption summary returns rows for all valid filter combinations; totals = posted |
| AT-LAB-022 | FR-LAB-022 | A | Delivery event separate from print; references the version |

### 14.6 Inpatient, nursing, pharmacy, inventory (Phase 4)

| ID | Req. | Layer | Scenario → expected |
| --- | --- | --- | --- |
| AT-IPD-001 | FR-IPD-001, FR-CLI-008 | A | Admission from OPD keeps the source visit; `AWAITING_BED` without occupancy |
| AT-IPD-002 | FR-IPD-001 | A | Second active admission for the same patient → 409 |
| AT-IPD-003 | FR-IPD-002 | A | Transfer keeps the admission/MRN; intervals adjacent; event recorded |
| AT-IPD-004 | FR-IPD-002 | A | Transfer to an unavailable bed → 409; source occupancy unchanged |
| AT-IPD-005 | FR-IPD-003 | A | Departure → bed `NEEDS_CLEANING`; allocation → `BED_NEEDS_CLEANING` |
| AT-IPD-006 | FR-IPD-006 | A | Cleaning complete → `AVAILABLE`; illegal transitions rejected |
| AT-IPD-007 | FR-IPD-007 | C | Two allocations of the last bed → one success |
| AT-IPD-008 | FR-IPD-009 | A | Manual bed charge duplicate (same admission/bed/date) → one charge |
| AT-IPD-009 | FR-IPD-010 | A | Discharge request notifies billing (outbox event) |
| AT-IPD-010 | FR-IPD-011 | A | After medical discharge, routine orders → 409 |
| AT-IPD-011 | FR-IPD-012 | A | Financial clearance with a balance → `FEATURE_NOT_AVAILABLE`; at 0 → `CLEARED` |
| AT-IPD-012 | FR-IPD-013 | A | Departure with dues requires acknowledgment → `DEPARTED_WITH_DUES`; account unsettled |
| AT-IPD-013 | FR-IPD-018 | A | Daycare and IPD views read one occupancy; an occupied bed is unavailable to both |
| AT-NUR-001 | FR-NUR-001 | A | Ward list shows active, Daycare and discharged-not-departed patients in scope only |
| AT-NUR-002 | FR-NUR-011 | E | Discharged badge has text and icon (not colour only) |
| AT-NUR-003 | FR-NUR-013 | A | Bed change visible on the next refresh; identity unchanged |
| AT-NUR-004 | FR-NUR-004 | A | Edit one indent line's quantity → other lines unchanged |
| AT-NUR-005 | FR-NUR-004 | A | Edit an issued line → 409 |
| AT-NUR-006 | FR-NUR-005 | A | Multi-line return → slip number; visible to pharmacy |
| AT-NUR-007 | FR-NUR-005 | A | Return quantity above returnable → 422 |
| AT-NUR-008 | FR-NUR-006 | A | Return after the final bill → supervisor queue; no automatic credit |
| AT-NUR-009 | FR-NUR-007 | A | Nurse cancellation request → approver queue; no direct cancellation |
| AT-PHA-001 | FR-PHA-001 | I | External fulfilment → no stock or charge |
| AT-PHA-002 | FR-PHA-002 | A,C | Dispense two lines with a retry → two movements, two charges |
| AT-PHA-003 | FR-PHA-013 | C | Concurrent dispenses beyond stock → one `INSUFFICIENT_STOCK` |
| AT-PHA-004 | FR-PHA-002 | A | Dispense links prescription/indent line, movement, charge |
| AT-PHA-005 | FR-PHA-005 | A | Expired batch (facility date) → `BATCH_EXPIRED` |
| AT-PHA-006 | FR-PHA-007 | A | Accepted return ≤ eligible issued quantity |
| AT-PHA-007 | FR-PHA-007 | A | Acceptance creates a return-in movement; credit only per CP-21 |
| AT-INV-001 | FR-INV-002 | I | Movement + balance projection in one transaction; reconciliation equal |
| AT-INV-002 | FR-INV-003 | C | Negative stock prevented under concurrency |
| AT-INV-003 | FR-INV-002 | I | `stock_movement` is append-only for `hms_app` |
| AT-INV-004 | FR-INV-004 | A | Adjustment requires a different approver; creates a movement |
| AT-INV-005 | FR-INV-005 | A | Transfer dispatch/receive with a discrepancy recorded |
| AT-INV-006 | FR-INV-009 | A | GRN retried with the same delivery reference → stock increases once |

### 14.7 Reporting, printing, integration, E2E journeys

| ID | Req. | Layer | Scenario → expected |
| --- | --- | --- | --- |
| AT-REP-001 | FR-REP-001 | A | Summary = detail for the collection report (fixture day) |
| AT-REP-002 | FR-REP-002 | A | Method breakdown incl. provider label; corrections in a separate section |
| AT-REP-003 | FR-REP-003 | A | Invoice register reconciles with collections for the period |
| AT-REP-004 | FR-REP-009 | A | Reports from read models show the "as of" timestamp |
| AT-REP-005 | FR-REP-004 | A | Export requires `report.export`; audited; tenant-scoped file |
| AT-REP-006 | FR-REP-005 | J | Large report runs as a job; notification and download link |
| AT-PRN-001 | FR-PRN-001 | E | Preview HTML equals the print HTML for the same record/template version |
| AT-PRN-002 | FR-PRN-002 | A | Print/preview creates a print event and changes no status |
| AT-PRN-003 | FR-PRN-005 | E | Bilingual receipt snapshot renders Bangla conjuncts with the bundled font (visual check) |
| AT-PRN-004 | FR-PRN-006 | J | Server PDF from the same template; hash stored; re-render produces an identical PDF hash or a documented difference |
| AT-INT-001 | FR-INT-002 | J | Simulated analyzer result → `ENTERED` version, source `ANALYZER`, not released |
| AT-INT-002 | FR-INT-003 | J | Duplicate message ID → one result; duplicate logged |
| AT-INT-003 | FR-INT-004 | J | Unknown specimen → quarantine; no result |
| AT-INT-004 | FR-INT-005 | J | Mapping version change applies only to new messages |
| AT-E2E-001 | BW-01, NFR-UX-001 | E | Keyboard-only: search → register → check-in → doctor invoice shown |
| AT-E2E-002 | BW-01 | E | Cashier pays D, then S lines; separate receipts; balances shown correctly |
| AT-E2E-003 | FR-BIL-036 | E | Network abort after commit → "Checking…" → "Saved"; no duplicate payment |
| AT-E2E-004 | BW-01, BW-04 | E | *(Written when Phase 3 starts.)* Full OPD → lab journey: check-in → pay D → consultation with orders → pay S lines → collect → enter → verify → release → deliver; the audit shows each actor |
