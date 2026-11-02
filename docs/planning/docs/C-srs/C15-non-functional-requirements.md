# C15 — Non-functional requirements and verification

| Control | Value |
| --- | --- |
| Document | C15 NFR register (authoritative for quality requirements; capacity detail lives in [M](../M-capacity-performance.md)) |
| Version | 0.4.0-draft |
| Status | Obligations CONFIRMED where tied to C-029. **Every numeric target is PROPOSED** unless stated otherwise. Targets need pilot data (Q-042) and owner approval (Q-043). |
| Owner role | Technical architect + QA lead |
| Supersedes | v0.3 NFR.md (IDs preserved, targets added as proposals) |

## 1. How to read targets

A target is only meaningful with these stated:
- **action**
- **load**
- **dataset size**
- **environment**
- **percentile**
- **evidence**

Each proposed target below names its measurement context in [M §7](../M-capacity-performance.md#7-load-test-methodology-and-measurable-targets). "PROPOSED" means "a starting point for agreement", not a promise. None of these numbers implies support for "100,000 users" (C-028).

## 2. Register

| ID | Quality and scenario | Requirement / target | Status | Verification |
| --- | --- | --- | --- | --- |
| NFR-ISO-001 | Tenant isolation across UI, API, jobs, files, cache, reports, exports, logs | Zero unauthorized cross-tenant access. Denied responses do not reveal the existence of another tenant's records. | CONFIRMED (C-029) | Two-tenant adversarial suite AT-ISO-* in CI on every PR touching data access ([H §4](../H-automated-test-plan.md#4-permission-denial-and-cross-tenant-isolation)) |
| NFR-PERF-001 | Interactive response under pilot peak | p95 server time:<br>• ≤ 500 ms for patient search and worklist reads<br>• ≤ 800 ms for check-in, payment, result entry commands<br>• ≤ 2 s for print preview rendering<br>Measured at the agreed pilot peak load with a representative dataset (M §7). Eliminates the 1–1.5 minute loaders (SRC-B01). | PROPOSED | k6 load test on staging-like VPS; APM percentiles in production |
| NFR-PERF-002 | Worklist refresh load | Polling worklists use conditional requests (ETag / `If-None-Match`). Unchanged responses return `304` without re-querying full data where possible. Default polling interval 15–30 s, configurable. Total polling load stays within the budget in M §4. | PROPOSED (P-019) | Load test of the polling mix; DB stats |
| NFR-PERF-003 | Heavy report isolation | Reports beyond the interactive budget run as background jobs (FR-REP-005). During a report job, interactive p95 stays within NFR-PERF-001. | PROPOSED | Load test with concurrent report jobs |
| NFR-CAP-001 | Capacity | Capacity tiers and expansion triggers are defined in M. No user-count claim without load-test evidence (C-028). | CONFIRMED rule; numbers PROPOSED | M §7 load and soak tests |
| NFR-AVAIL-001 | Availability of critical workflows (registration, cashier, lab release, bed board) | **Engineering objective (PROPOSED):** 99.5% monthly availability, excluding announced maintenance, for the single-VPS topology. Higher objectives require the expanded topology ([J §3](../J-vps-deployment-operations.md#3-topology-options)). The hospital's required objective is OPEN (Q-043). | OPEN / PROPOSED | Synthetic workflow probes every minute; incident log |
| NFR-REC-001 | Database and file recovery | **PROPOSED engineering targets:**<br>• RPO ≤ 15 minutes (continuous WAL archiving)<br>• RTO ≤ 4 hours for a full single-VPS rebuild<br>• per-tenant logical restore into a staging environment within 1 business day<br>Values OPEN (Q-043). | OPEN / PROPOSED | Timed restore drills ([J §8](../J-vps-deployment-operations.md#8-backups-and-tested-restoration)), at least before go-live and periodically after |
| NFR-AUD-001 | Audit completeness | Every permission in C00 §8 that changes state, plus FR-AUD-003 reads, produces an audit event. 100% coverage of the catalogue. | CONFIRMED (C-029) | Automated catalogue-vs-audit test AT-AUD-001; review |
| NFR-INTEG-001 | No duplicate money, stock or beds from retries | One posting per source operation. Idempotent commands for payments, charges, dispenses, receipts of goods, bed allocation. | CONFIRMED (C-029) | AT-BIL-009..014, AT-PHA-002, AT-INV-001, AT-IPD-007 |
| NFR-UX-001 | Keyboard-driven front-line flows | Reception search → register → check-in, cashier payment and order entry are completable without a mouse. Focus order is logical, and shortcuts are documented ([F §7](../F-ui-ux-design.md#7-form-validation-keyboard-operation-accessibility-and-localization)). | SOURCE-DERIVED (SRC-B01); details PROPOSED | Playwright keyboard-only E2E; staff usability sessions |
| NFR-ACC-001 | Accessibility | WCAG 2.2 Level AA for staff and portal screens (PROPOSED target). Colour is never the only status signal. | PROPOSED | axe-core automated checks + manual screen-reader and keyboard review |
| NFR-PRINT-001 | Print correctness | Approved templates print legibly and correctly on the pilot's printers at A4, A5 and label sizes, in Bangla and English, on the first attempt. | SOURCE-DERIVED | UAT-PRN-* on real devices |
| NFR-I18N-001 | Bilingual operation | 100% of staff UI strings exist in `bn-BD` and `en` (build check). Bangla text renders with correct shaping in UI and PDF. Dates use the facility timezone. | CONFIRMED (C-025) | Catalog completeness check; visual regression on Bangla screens; UAT-I18N |
| NFR-OBS-001 | Diagnosability | Every request has a correlation ID that propagates to logs, traces, jobs and audit. Hangs, account locks, stuck jobs and queue backlog are visible on dashboards without reading patient data. | CONFIRMED need (SRC-N02, SRC-N10) | Incident simulation drills (J §11) |
| NFR-SEC-001 | Transport security | TLS 1.2 minimum (1.3 preferred) for all external traffic. HSTS. No plaintext HTTP except the ACME challenge and redirect. | PROPOSED | TLS scanner in staging; config review |
| NFR-SEC-002 | Credentials and secrets | Passwords hashed with argon2id. Secrets never in the repository, images or logs. Secrets are mounted as files and rotatable. | PROPOSED (P-008) | gitleaks in CI; image inspection; review |
| NFR-SEC-003 | Web application security | Controls aligned with OWASP ASVS Level 2 (PROPOSED reference):<br>• CSRF protection for cookie sessions<br>• output encoding / CSP<br>• parameterized queries only<br>• strict input validation (Zod)<br>• secure cookie flags<br>• no business writes from Next.js | PROPOSED | Security test cases (H §11), dependency and image scans, review checklist |
| NFR-SEC-004 | Vulnerability management | Dependency, secret and image scanning on PRs and nightly. Critical vulnerabilities in production dependencies are triaged within 1 business day (PROPOSED). Actions pinned by commit SHA. | PROPOSED | CI evidence ([L](../L-cicd-sonarqube.md)) |
| NFR-SEC-005 | Abuse protection | Login and password-reset rate limits per account and IP. API rate limits per session to protect shared resources. | PROPOSED | AT-ACC-* |
| NFR-REL-001 | Safe retries | All state-changing commands accept idempotency keys. Outbox/inbox guarantee at-least-once delivery with deduplication. | PROPOSED (ADR-006) | AT-JOB-* |
| NFR-REL-002 | Graceful shutdown | On deploy or stop:<br>• API drains in-flight requests (≤ 30 s, PROPOSED)<br>• workers stop taking jobs and finish or release them<br>• no job is lost<br>• no money or stock is duplicated | PROPOSED | Deploy-under-load test (H §10) |
| NFR-MAINT-001 | Module boundaries | Package dependency rules are enforced by tooling. Cross-module table access is detected in CI. | PROPOSED (ADR-001) | dependency-cruiser / lint rules in CI |
| NFR-MAINT-002 | Test coverage of domain logic | Line coverage ≥ 80% and branch coverage ≥ 70% for `packages/mod-*` domain and application layers (PROPOSED thresholds). Coverage is a floor, not evidence of correctness ([L §9](../L-cicd-sonarqube.md#9-what-quality-gates-do-not-prove)). | PROPOSED | Jest coverage thresholds + Sonar on `main` |
| NFR-RET-001 | Retention | Operational retention for audit, logs, backups and exports. Statutory retention is DEFERRED. | OPEN (Q-053) | Policy review |
| NFR-COMP-001 | Browser support | Current and previous major versions of Chrome, Edge and Firefox on desktop. Tablet Chrome for nurse views (AS-003). | PROPOSED | Playwright projects for Chromium and Firefox |
| NFR-DATA-001 | Tenant data export | A complete per-tenant export can be produced without affecting other tenants (FR-SAA-008). | PROPOSED | Export drill |
| NFR-TIME-001 | Time correctness | Servers synchronized with NTP. Instants stored in UTC (`timestamptz`). Business dates computed in the facility timezone. Day boundaries tested on both sides of midnight Asia/Dhaka. | CONFIRMED (v0.3 DATA) | AT-TIME-001..003 |
| NFR-PORT-001 | Hosting neutrality | Runs on any Linux VPS with Docker. No provider-specific services are required for core function. Object storage via the S3 API. | CONFIRMED (C-026) | Staging on a second provider before production, PROPOSED |

## 3. NFR acceptance at release gates

| Gate | NFRs that must have evidence |
| --- | --- |
| RG-1 Foundation | NFR-ISO-001 (suite exists and passes), NFR-AUD-001 (mechanism), NFR-SEC-002/004 (pipeline), NFR-MAINT-001, NFR-I18N-001 (catalog check), NFR-TIME-001 |
| RG-2 Slice | NFR-INTEG-001 for the slice's commands; NFR-UX-001 for the slice's screens; NFR-ACC-001 automated checks |
| RG-3 Pilot readiness | NFR-PERF-001..003 at the agreed pilot load; NFR-PRINT-001; NFR-REC-001 drill; NFR-OBS-001 drill; NFR-REL-002 |
| RG-4 Go-live | All of the above, plus NFR-AVAIL-001 monitoring live and NFR-SEC-001/003/005 reviewed |
