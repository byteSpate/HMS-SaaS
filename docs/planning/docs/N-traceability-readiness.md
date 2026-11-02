# N — Traceability and readiness report

| Control | Value |
| --- | --- |
| Document | N Traceability (objective → workflow → requirement → decision → module → API/data → permission → test → gate) and readiness |
| Version | 0.4.0-draft |
| Status | Register. **No requirement is verified yet.** There is no code, so every "evidence" cell refers to planned tests. |
| Owner role | Product owner + QA lead |
| Updated | 2026-10-12 |
| Supersedes | baseline [TRACEABILITY.md](../baseline/hospital-saas-planning-kit-v0.3/docs/TRACEABILITY.md), [READINESS.md](../baseline/hospital-saas-planning-kit-v0.3/docs/READINESS.md), [RISK_REGISTER.md](../baseline/hospital-saas-planning-kit-v0.3/docs/RISK_REGISTER.md) |

## 1. How to use this register

- Each row links one requirement through the chain.
- When code exists, add the package path, the PR, the test run link and the gate result. A row is **Verified** only when its tests ran green on `main` and, for clinical/financial behavior, the domain reviewer signed off.
- Readiness labels:
  - **Specified**: buildable now; blocking questions are answered or explicitly excluded with interim behavior.
  - **Specified-interim**: buildable with a documented interim rule while a question stays open.
  - **Proposed**: design exists; approval needed.
  - **Blocked**: cannot be built without answers.
  - **Gap**: insufficient specification.

## 2. Objective-to-gate chains (core requirements)

| BO | BW | Requirement | Decision / source | Module | API command / data | Permission | Tests | Gate | Readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BO-06 | BW-14 | FR-SAA-001 | C-001, C-029 | identity-access, all | all; `tenant_id` + RLS (E §6) | — | AT-ISO-001..012, UAT-ADM-006 | RG-1, RG-4 | Proposed (P-003; spike T-FND-04) |
| BO-06 | BW-14 | FR-SAA-002 | v0.3 | identity-access (control) | `ProvisionTenant`; `tenant`, `provisioning_run` | `vendor.tenant.provision` | AT-SAA-001 | RG-1 | Specified |
| BO-06 | — | FR-SAA-004 | v0.3 | identity-access | guard; `tenant_entitlement` | — | AT-SAA-002 | RG-1 | Specified |
| BO-05 | all | FR-ACC-009, FR-ACC-010 | C-029 | authz | guards; `membership` | per C00 §8 | AT-ACC-011, AT-ISO-009 | RG-1 | Specified |
| BO-04 | — | FR-ACC-003..006 | SRC-N02/N10, P-008 | identity-access | `Login`, `VerifyTotp`; `user_session` | — | AT-ACC-001..010 | RG-1 | Specified-interim (Q-051 defaults) |
| BO-05 | all | FR-AUD-001..006 | C-029 | platform | interceptor; `audit_event` | `audit.view` | AT-AUD-001..006, UAT-ADM-004 | RG-1 | Specified (Q-053 retention open) |
| BO-08 | all | FR-I18N-001..006 | C-025 | i18n, web | catalogs; `name_bn/name_en` | — | AT-I18N-001..005, UAT-I18N-001..006 | RG-1, RG-3 | Specified-interim (Q-050) |
| BO-01 | BW-01 | FR-PAT-001, -011 | Identity agreements | patients | `RegisterPatient`, `FindDuplicateCandidates`; `patient` | `patient.record.*` | AT-PAT-001..004, UAT-REC-002 | RG-2 | Specified |
| BO-01 | BW-01 | FR-PAT-002 | C-024 | patients | `RegisterPatient`; `number_sequence` | `patient.record.register` | AT-PAT-005, -006, UAT-REC-003 | RG-2 | Specified-interim (Q-034, Q-035) |
| BO-01 | BW-01 | FR-PAT-003 | SRC-P02 | patients | `SearchPatients`; `phone_normalized` | `patient.record.search` | AT-PAT-007, UAT-REC-001 | RG-2 | Specified |
| BO-01 | BW-08 | FR-PAT-004 | Identity agreements | patients | `RegisterTemporaryPatient` | `patient.record.register` | AT-PAT-008 | RG-2 | Specified-interim (Q-036: link deferred) |
| BO-01 | BW-03 | FR-SCH-001..004 | C-007, SRC-O01 | scheduling | `BookAppointment` …; `appointment`, `schedule_session` | `scheduling.*` | AT-SCH-001..006, UAT-REC-005 | RG-2 | Specified-interim (Q-037) |
| BO-01 | BW-01 | FR-VIS-001, -002 | C-006, C-007 | clinical | `CheckInAppointment`, `CreateVisit`; `visit` | `visit.*` | AT-VIS-001..005, UAT-REC-006/007 | RG-2 | Specified |
| BO-02 | BW-01 | FR-BIL-001 | C-008 | billing | `IssueVisitInvoices`, `PostCharge`; `invoice` partial uniques | `billing.invoice.issue` | AT-BIL-001, UAT-CSH-002 | RG-2 | Specified |
| BO-02 | BW-01 | FR-BIL-002 | C-009 | billing | `RecordPayment` | `billing.payment.record` | AT-BIL-003 | RG-2 | Specified |
| BO-02 | BW-01/02 | FR-BIL-003 | C-011 | billing, lab | `AssertEligible`; `invoice_line.eligibility` | — | AT-BIL-005..007, UAT-CSH-004 | RG-2 | Specified-interim (full payment only; Q-004) |
| BO-02 | BW-13 | FR-BIL-004 | C-010 | billing | `payment.method` | — | AT-BIL-008, UAT-CSH-005 | RG-2 | Specified |
| BO-02 | all | FR-BIL-006 | SRC-B06 | billing | `charge.source_ref` unique | system | AT-BIL-009, -010 | RG-2 | Specified |
| BO-02 | BW-01 | FR-BIL-011, -012, -034, -036 | C-029, P-020 | billing, platform | `RecordPayment`; `payment_allocation`; `idempotency_record` | `billing.payment.record` | AT-BIL-011..014, AT-E2E-003, UAT-CSH-006 | RG-2 | Specified-interim (Q-022, Q-024) |
| BO-02 | BW-13 | FR-BIL-025 | SRC-B04 | billing | `CorrectPaymentMethod` | `billing.payment.method_correct` | AT-BIL-015, UAT-CSH-009 | RG-2 | Specified-interim (Q-068) |
| BO-02 | BW-13 | FR-BIL-026, FR-REP-002 | SRC-B07 | billing, reporting | sessions; collection report | `billing.cashier_session.*`, `report.view.billing` | AT-BIL-016/017, AT-REP-001..003, UAT-CSH-010 | RG-2, RG-3 | Specified |
| BO-02 | — | FR-BIL-013..024 | SRC-O03/B02/B05, C-011 | billing | — | — | — | — | **Blocked** (Q-004, Q-005, Q-019..Q-024, Q-038, Q-045, Q-061) |
| BO-03 | BW-01 | FR-CLI-001..003 | C-012, C-029 | clinical | `SignClinicalDocument`, `SignPrescription` | `clinical.*` | AT-CLI-001..006, UAT-DOC-001..003 | RG-2 | Specified-interim (Q-066, Q-067 content) |
| BO-02 | BW-01 | FR-ORD-001..005 | C-006, C-008, C-011 | clinical, billing | `CreateServiceOrder`; `service_order`, `charge` | `order.*` | AT-ORD-001..006 | RG-2 | Specified |
| BO-02 | BW-01 | FR-ORD-006 | SRC-N07 | clinical, billing | `CancelServiceOrder` | `order.service.cancel` | AT-ORD-007, -008 | RG-2 | Specified-interim (Q-017) |
| BO-03 | BW-04 | FR-LAB-001, -004..-011 | C-019, SRC-L16 | lab | `CollectSpecimen` … `ReleaseResult`; `specimen`, `result_version` | `lab.*` | AT-LAB-008..016, UAT-LAB-001..007 | RG-2 | Specified-interim (Q-009 mapping) |
| BO-03 | BW-04 | FR-LAB-002 | SRC-L12..L15 | lab, web | read endpoints only | — | AT-LAB-001..005, UAT-LAB-008..010 | RG-2 | Specified |
| BO-03 | BW-04 | FR-LAB-003, -016 | SRC-L08/L17 | lab | versions; `test_definition_version` | `lab.config.manage` | AT-LAB-006, -007 | RG-2 | Specified-interim (Q-011 content) |
| BO-03 | BW-04 | FR-LAB-012 | C-029 | lab | `AmendResult` | `lab.result.amend` | AT-LAB-017, UAT-LAB-011 | RG-2 | Specified-interim (Q-011 approval) |
| BO-03 | BW-04 | FR-LAB-013, -015, -017 | SRC-L09/L01 | lab | — | — | — | — | **Blocked** (Q-010, Q-011, Q-012) |
| BO-08 | BW-04 | FR-LAB-005, -014, FR-PRN-001..006 | SRC-Q01, C-025 | lab, print | render/print events | — | AT-PRN-001..004, UAT-PRN-001..008 | RG-3 | Specified-interim (Q-046) |
| BO-03 | BW-05 | FR-IPD-001..003, -007 | C-013..C-016 | ipd | `AdmitPatient`, `AllocateBed`, `TransferBed`; `bed_occupancy` | `ipd.*` | AT-IPD-001..007, UAT-IPD-001..004 | RG-2 (RP-B) | Specified |
| BO-02 | BW-05 | FR-IPD-004, FR-BIL-028/029 | C-017 | billing, ipd | running invoice; final bill | `billing.*` | AT-BIL-019, -020, UAT-IPD-005/007 | RG-2 (RP-B) | Specified-interim (Q-004, Q-040) |
| BO-03 | BW-05 | FR-IPD-010..013 | C-017, SRC-I05 | ipd | discharge commands | `ipd.discharge.*` | AT-IPD-009..012 | RG-2 (RP-B) | Specified-interim (Q-006) |
| BO-02 | BW-05 | FR-IPD-009 | SRC-I06/I07 | ipd, billing | manual bed charge | `billing.invoice.issue` | AT-IPD-008 | RG-2 (RP-B) | Specified-interim (Q-007; automatic engine Blocked) |
| BO-03 | BW-06 | FR-NUR-001..006 | SRC-N01..N11 | nursing, pharmacy | indents, returns | `nursing.*`, `pharmacy.return.accept` | AT-NUR-001..008, UAT-NUR-001..004 | RG-2 (RP-B) | Specified-interim (Q-018) |
| BO-03 | BW-07 | FR-PHA-001, -002, -005, -007 | C-012, SRC-S01 | pharmacy, inventory | `DispenseMedicines`; `stock_movement` | `pharmacy.*` | AT-PHA-001..007, UAT-PHA-001/002 | RG-2 (RP-B) | Specified-interim (Q-014, Q-015) |
| BO-03 | BW-12 | FR-INV-001..006, -009 | SRC-S02/S03 | inventory | movements, transfers, GRN | `inventory.*` | AT-INV-001..006 | RG-5 | Specified (ledger); procurement **Gap** (Q-064) |
| BO-09 | BW-08/09 | FR-EMG-*, FR-DAY-* | C-011, SRC-E01 | emergency, daycare | — | — | — | RG-5 | **Blocked** (Q-005, Q-025, Q-026) |
| BO-09 | BW-10/11 | FR-RIS-*, FR-OT-* | SRC-R01/T01 | radiology, ot | — | — | (FR-OT-001 idempotency tests reusable) | RG-5 | **Gap** (Q-027, Q-028) |
| BO-09 | BW-15 | FR-FIN-*, FR-HR-* | SRC-B07/H01 | finance, workforce | — | — | — | RG-5 | **Gap** (Q-029, Q-030, DEF-001) |
| BO-09 | BW-16 | FR-POR-*, FR-B2B-*, FR-REF-* | SRC-C01 | portal, b2b | — | — | — | RG-5 | **Gap** (Q-031..Q-033) |
| BO-03 | — | FR-INT-002..005 | SRC-L07/L08 | integrations | adapter → `ImportAnalyzerResult` | system | AT-INT-001..004 | RG-5 | **Blocked** (Q-047) |
| BO-07 | — | NFR-REC-001 | C-029 | ops | pgBackRest, RB-07 | — | UAT-DT-003 | RG-3, RG-4 | Specified-interim (Q-043 targets) |
| BO-04 | — | NFR-PERF-001..003 | SRC-B01 | all | — | — | M §7 load tests | RG-3 | Proposed (targets need approval) |
| BO-07 | — | NFR-OBS-001, NFR-AVAIL-001 | SRC-N02/N10 | ops | J §10 | — | drills (J §11) | RG-3, RG-4 | Proposed |

## 3. Readiness summary

| Area | Specified enough now | Proposed (needs approval) | Blocked by questions |
| --- | --- | --- | --- |
| Platform / tenancy / auth / audit | Requirements, permissions, audit, error model | P-003 RLS approach (spike), P-008 auth, P-009 contracts, P-010 outbox/jobs | Q-051 (policy values), Q-053 (retention) |
| Front desk and scheduling | Search, register, duplicates, check-in, visits | MRN pattern format | Q-034, Q-035, Q-036 (merge), Q-037 |
| Billing (OPD) | Separate invoices, full-payment gate, methods, idempotency, sessions, receipts | Allocation storage (P-020), money model (P-011) | Q-004, Q-019..Q-024, Q-038, Q-039, Q-045, Q-068 |
| OPD clinical | Prescription/dispense separation, sign/amend versions, orders and gate | Worklist statuses | Q-017, Q-066, Q-067 |
| Laboratory | Lifecycle, no-regression rules, rejection/recollection, amendment, versions | State naming mapping (CX-003) | Q-009, Q-010, Q-011, Q-012, Q-013, Q-047 |
| IPD / nursing / pharmacy | Occupancy model, transfers, cleaning, separate discharge facts, indents/returns, dispensing ledger | Exclusion constraints (P-012) | Q-004, Q-006, Q-007, Q-008, Q-014..Q-018, Q-040, Q-063, Q-069, Q-070 |
| Emergency, Daycare, Radiology, OT | Identity and priority recording, idempotent OT charges | — | Q-005, Q-025..Q-028, Q-061 |
| Finance, HR, payroll | Cashier day close, finance search, employee master | — | Q-029, Q-030, DEF-001 |
| Portal, B2B, referrals | Principles only | — | Q-031..Q-033 |
| Printing and language | Requirements, layouts, print/PDF approach | P-014, P-022 | Q-046, Q-050 |
| Operations | Topology options, backups, runbooks, CI/CD design | P-015, P-016, P-018 | Q-043, Q-044, Q-055, Q-056 |
| Capacity | Model, method, triggers | Targets | Q-041, Q-042 |

## 4. What is needed before each step

### 4.1 Before scaffolding (RG-0)

Status on 2026-10-14:

- [x] Product owner ratifies C-022..C-025 (A2 §2.2, 2026-10-14).
- [x] Approve or amend: P-001 (ADR-001), P-003 (ADR-003), P-007 (ADR-002), P-008 (ADR-004), P-009 (ADR-005), P-010 (ADR-006), P-016 (ADR-012) approved; P-017 (ADR-013) superseded by ADR-018; P-021 applied in `docs/STACK_VERSIONS.md` (A2 §3).
- [x] Decide Redis 8 vs Valkey (CX-015 → ADR-020) and the GitHub plan (Q-055 → C-047).
- [x] Staging provider chosen (Q-044 → ADR-020); tools VPS deferred (Q-056 → C-048). GitHub repositories created. Branch protection waits for a paid plan (C-047). Development is local for now (C-050).
- [ ] Name owners for the roles in A0 §3: integrator, QA lead, DevOps lead, domain reviewers.
- [x] Choose a release option (Q-001 → C-031: RP-A).

### 4.2 Before the first workflow coding task (front desk + cashier, RG-1 passed)

- [ ] RG-1 evidence: isolation suite green, staging deploy, restore drill done, CI gates enforced.
- [ ] Answers or accepted interim behavior for: Q-003 (front desk/cashier part), Q-020, Q-022, Q-024, Q-034, Q-035, Q-037, Q-038, Q-039, Q-046 (receipt/token printers), Q-050, Q-051, Q-068.
- [ ] Deposit behavior explicitly excluded (Q-004) or answered.
- [ ] Contract PRs for patients, scheduling, visits and billing merged (G §6).
- [ ] Native-speaker reviewer available for new strings.

### 4.3 Before production (RG-4)

- [ ] Release option approved (Q-001). All slices in scope passed RG-2.
- [ ] UAT passed with department sign-offs (I §9.4). No open S1/S2 defects.
- [ ] Load tests at pilot peak and 2× pass the approved targets (M §7). Sizing confirmed.
- [ ] Restore drill within the agreed RPO/RTO (Q-043). Downtime procedure rehearsed (UAT-DT-001..003).
- [ ] Printers and devices validated at every workstation type (I §5).
- [ ] Monitoring and alerting live. On-call and support hours agreed (Q-043).
- [ ] Data migration completed and reconciled, if any (Q-048).
- [ ] Security review of auth, tenancy, exports and file access. Secrets rotated from staging values.
- [ ] Contracts with the hospital cover support access (FR-SUP-001) and incident communication.
- [ ] The separately scoped review of deferred government topics (DEF-001) has been considered by the owner. This pack makes **no compliance claim**.

## 5. Release gates

| Gate | Name | Evidence required | Decides |
| --- | --- | --- | --- |
| **RG-0** | Planning gate | §4.1 checklist; this pack reviewed; ADR approvals recorded in A2 | Product owner + tech lead |
| **RG-1** | Foundation gate | T-FND-01..05, T-DB-01..03, T-ACC-01..05, T-PLT-01..06, T-UI-01/02, T-I18N-01, T-PRN-01, T-OPS-01..03 done. Isolation suite green on `main`. Restore drill record on staging. Sonar gate operating on `main`. Version pins recorded. | Tech lead |
| **RG-2** | Slice acceptance (per slice) | All slice tasks meet DoD (G §4). Requirement rows in §2 marked Verified with test links. Domain reviewer sign-off for financial/clinical behavior. Accessibility checks. Both languages. | Tech lead + domain reviewer |
| **RG-3** | Pilot readiness | All RG-2 slices of the release option. UAT passed (I §2 exit criteria). Load tests (M §7). Restore drill within targets. Downtime drill. Printer matrix complete. Monitoring/alerts tested. | Product owner + pilot management |
| **RG-4** | Production go-live | RG-3, plus §4.3 checklist, go-live runbook, cutover plan, support roster | Product owner |
| **RG-5** | Expansion gate (each later module or capacity tier) | The module's blocking questions answered; RG-2 for its slices; capacity triggers reviewed (M §8) | Product owner + tech lead |

## 6. Risk register (extended)

The rating method (likelihood × impact, 1–5) is PROPOSED. **Ratings are not assigned here.** The owner assigns them at RG-0, to avoid fabricated scores (v0.3 rule).

| ID | Scenario | Controls in this design | Evidence / open work | Owner (role) |
| --- | --- | --- | --- | --- |
| R-01 | Wrong patient selected | Banner, per-tab context, context IDs re-checked server-side, duplicate review (F §3) | UAT-REC-*, UAT-E2E-001 | Front desk lead |
| R-02 | Doctor-fee payment unlocks unpaid tests | Separate invoices; line-level eligibility (FR-BIL-003, ADR-016) | AT-BIL-001, -005; UAT-CSH-004 | Finance lead |
| R-03 | Cross-customer data leaked | Three-barrier tenancy, scoped cache/jobs/files, isolation suite | AT-ISO-*; T-FND-04 spike | Tech lead |
| R-04 | Duplicate payment/OT/EMR posting | Idempotency, source references, inbox dedupe | AT-BIL-009..013, AT-JOB-* | Tech lead |
| R-05 | Report opens as Pending after release | FPR-07; read endpoints side-effect-free | AT-LAB-001..005 | Lab manager |
| R-06 | Two admissions allocated the same bed | Exclusion constraints | AT-IPD-007, E race C1 | Tech lead |
| R-07 | Stock/return differs from patient bill | Linked movements and charges; acceptance before credit (interim) | AT-PHA-*, AT-NUR-* | Chief pharmacist |
| R-08 | Bed charge incorrectly applies a cutoff | No automatic engine until Q-007; manual posting deduplicated | AT-IPD-008 | Finance lead |
| R-09 | Source menu mistaken for a full HR/finance spec | Explicit gaps (C12) | Q-029/Q-030 | Product owner |
| R-10 | AI agent invents unresolved policy | DoR excluded-behavior section, `FEATURE_NOT_AVAILABLE`, domain review | Code review checklist; G §4 | Tech lead |
| R-11 | Outage/migration loses or duplicates work | Downtime procedure, reconciliation, idempotent back-entry | UAT-DT-*, RB-03, RB-14 | DevOps + finance |
| R-12 *(new)* | Release scope chosen without the pilot profile | Release options in B §9; Q-042 first | RG-0 | Product owner |
| R-13 *(new)* | Single-VPS host failure during clinical hours | Paper downtime kit, restore drills, expansion path | RB-03, RB-07; Q-043 | Product owner (risk acceptance) |
| R-14 *(new)* | Toolchain incompatibility (ESM, TS 7, Prisma 8 RC tag, NestJS 12) | Pins (P-021), spike T-FND-01, CX-011..CX-019 | Spike evidence | Integrator |
| R-15 *(new)* | Supply-chain compromise in CI actions or images | SHA pinning, least-privilege workflows, no `pull_request_target`, scanners, signed releases | L §2, §5 | DevOps lead |
| R-16 *(new)* | Bangla rendering or terminology errors on prints | Self-hosted fonts, Chromium rendering, native review, printer UAT | T-PRN-01, UAT-I18N-*, UAT-PRN-* | Product owner + native reviewer |
| R-17 *(new)* | Polling load grows faster than expected | ETag/304, intervals, SSE trigger | M §8 | Architect |
| R-18 *(new)* | Licence or maintenance status of infrastructure components changes (Redis/Valkey, MinIO precedent) | Owner licence decision; maintained alternatives; periodic dependency review | D1 §4; CX-015/016 | Tech lead |

## 7. Consistency checks performed on this pack (2026-10-12)

The checks below were executed when the pack was packaged. Results are recorded in [`CHANGES_AND_OPEN_DECISIONS.md`](../CHANGES_AND_OPEN_DECISIONS.md#5-consistency-checks-run-on-this-pack).

1. All relative Markdown links resolve to existing files. Heading anchors used in links exist.
2. Every `FR-*`, `NFR-*`, `Q-*`, `C-*`, `P-*`, `DEF-*`, `ADR-*` referenced anywhere is defined in its authoritative document.
3. Every `AT-*` and `UAT-*` referenced in C/G/N/B is defined in H or I.
4. No requirement row is marked Verified.
5. The baseline v0.3 files are byte-identical to the supplied ZIP (SHA-256 comparison).
