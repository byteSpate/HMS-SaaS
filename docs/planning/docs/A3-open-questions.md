# A3 — Open questions register

| Control | Value |
| --- | --- |
| Document | A3 Open questions (authoritative list of everything unanswered) |
| Version | 0.4.0-draft |
| Status | OPEN items; nothing here may be guessed in code |
| Owner role | Product owner (keeps the register); each question names a responder |
| Updated | 2026-10-14 (Phase 0 answers recorded as C-031..C-050) |
| Supersedes | `baseline/.../docs/OPEN_QUESTIONS.md`. Q-001 to Q-006 keep their IDs. The v0.3 paragraph-style domain questions now have IDs Q-007 onward. |

## How to use this register

- **Agents:** before starting a task, check the "Blocks" column. If your task touches a blocked behavior, either exclude that behavior from the task explicitly or stop and report. Never encode a guessed clinical, financial, payroll, bed-charge or approval rule.
- **Owners:** answer in priority order. Record each answer as a decision in [A2](A2-decision-register.md) with date and approver, then mark the question "Answered → C-0NN" here.
- **Interim handling** says what the software does until the question is answered. For blocked behavior the usual interim answer is "not implemented; the feature is unavailable".

Priority key:
- **P1** — needed before the first workflow slice (reception/cashier).
- **P2** — needed before the OPD/diagnostics slice.
- **P3** — needed before the inpatient slice.
- **P4** — needed before that module is built.
- **T** — technology or operations question.

## 1. Product scope and customer model

| ID | Question | Why it matters | Blocks | Responder | Priority | Interim handling |
| --- | --- | --- | --- | --- | --- | --- |
| Q-001 | What must the first production release include? | Earlier assistant suggestions were not owner approval. The pilot's needs decide whether IPD or pharmacy are day-one. | — | — | — | **Answered → C-031** (RP-A: outpatient + diagnostics first). |
| Q-002 | Is a customer one hospital or a group? | MRN scope, permissions, billing scope. | — | — | — | **Answered → C-024** (one hospital now; groups DEFERRED as DEF-002). |
| Q-042 | What is the pilot hospital's profile?<br>• beds and wards<br>• daily OPD, diagnostic and IPD volumes<br>• staff count by role<br>• workstations and printers<br>• peak hours<br>• overnight operations | Capacity, release choice, UAT plan, device list. | M scenario calibration; I device plan; RG-3. | Product owner + pilot | P1 | Use the labelled synthetic profiles in [M §3](M-capacity-performance.md#3-planning-scenarios). |
| Q-052 | What are the subscription plans, limits, trial/suspension rules and continuity rules for an active admission when a subscription lapses? | Entitlement checks must not stop active care unexpectedly. | FR-SAA-007; DEF-006. | Product owner (commercial) | P4 | Entitlements are on/off flags set by the vendor operator. No automatic suspension. |

## 2. Roles, permissions and approvals

| ID | Question | Why it matters | Blocks | Responder | Priority | Interim handling |
| --- | --- | --- | --- | --- | --- | --- |
| Q-003 | Which staff roles perform and which approve each action? | The complete permission matrix. | All sensitive commands. The default role templates in [C01 §5](C-srs/C01-platform-access-audit.md#5-default-role-templates-proposed) are proposals. | Hospital operations lead | P1 | **Answered for RP-A → C-045** (proposed role templates; hospitals still sign off production grants). |
| Q-039 | Who **issues** invoices (reception, billing desk, cashier) and who **collects** payment? Can one person do both? | Segregation of duties. Cashier collection is confirmed (C-009); issuing is not. | — | — | — | **Answered → C-042** (cashier issues and collects; permissions stay separate). |
| Q-051 | Authentication policy:<br>• which roles need a second factor<br>• idle and absolute session timeouts<br>• shared workstations<br>• lockout threshold and unlock authority | Security, the nurses' "session hang / re-login" complaints (SRC-N02/N10). | — | — | — | **Answered → C-032** (MFA admin + finance; 60 min idle / 12 h; lock after 5 for 15 min). |

## 3. Patient identity, scheduling and visits

| ID | Question | Why it matters | Blocks | Responder | Priority | Interim handling |
| --- | --- | --- | --- | --- | --- | --- |
| Q-034 | What are the MRN format and sequence? (prefix, length, yearly reset or continuous, check digit) | Printed on every document. Hard to change later. | — | — | — | **Answered → C-033** (`{PREFIX}-{seq:6}`, continuous, e.g. `SMH-000123`). |
| Q-035 | Which demographic fields are required? Are names captured in Bangla, English or both? How are addresses structured? Is age-only registration allowed? | Registration form, duplicate search, printing. | — | — | — | **Answered → C-034** (name, sex, age or DOB, mobile; address optional). |
| Q-036 | Who may edit identity fields after registration? What is the reconciliation/merge procedure for duplicates and temporary emergency identities? | Wrong-patient risk (R-01). | FR-PAT-004, FR-PAT-008. | Hospital operations + clinical lead | P2 | Edit is permission-gated and audited. Merge is **not implemented**; linking a temporary identity is implemented only after this answer. |
| Q-037 | What are the slot capacity rules?<br>• overbooking<br>• serial or token numbers for the doctor queue<br>• walk-ins merged into the same queue? | Doctor queue fairness, receipt printing. | — | — | — | **Answered → C-035** (fixed capacity, no overbooking, serial at check-in, walk-ins in the same queue). |
| Q-038 | Doctor fee rules:<br>• per doctor<br>• new vs follow-up rates and the follow-up window<br>• "authorized doctor consultation reduction" (SRC-B02) — who and how much | Doctor invoice amount. | — | — | — | **Answered → C-041** (new and follow-up fee per doctor, follow-up window per doctor; no reductions). |

## 4. Billing, payments and finance

| ID | Question | Why it matters | Blocks | Responder | Priority | Interim handling |
| --- | --- | --- | --- | --- | --- | --- |
| Q-004 | Does a deposit unlock each service independently, and how is it allocated across lines? | Enforcing payment-first without a misleading total (R-02). | FR-BIL-003 deposit path; FR-BIL-012. | Cashier lead + finance | P3 | **Answered for RP-A → C-040** (no deposits in the first release). Still open for inpatient (RP-B) with Q-040. |
| Q-005 | What emergency payment exceptions are needed? (treat now, bill later; who authorizes; limits) | Urgent care must not be blocked by a generic payment rule. | FR-EMG-004, FR-BIL-016. | Emergency lead + finance | P2 | Emergency workflows are **not in the first slice**. Where emergency care starts before payment, staff use the paper downtime process until this is answered. |
| Q-006 | What happens when an IPD patient is medically discharged with an unpaid balance? How do medical discharge, financial clearance and physical departure relate? | Discharge state machine; bed release; final bill. | FR-IPD-010..013. | Hospital management + finance | P3 | Separate facts are modeled. Financial clearance with dues is **not available**. Physical departure can always be recorded so the bed board stays truthful. It is flagged `DEPARTED_WITH_DUES` with an explicit acknowledgment and no policy implied (FR-IPD-013). |
| Q-019 | Discounts:<br>• who may give them, and limits per role<br>• item-wise vs bill-level ("head") discount<br>• reasons list<br>• whether discount without patient selection (SRC-O03) is allowed | Revenue leakage, audit. | FR-BIL-013, FR-BIL-014. | Finance + management | P2 | Discounts **not implemented** in slice 1. |
| Q-020 | Rounding:<br>• rounding to whole taka on invoices or receipts<br>• explicit fraction-adjustment line (SRC-B05)<br>• rounding of percentage discounts | Totals must match detail. | FR-BIL-017. | Finance | P1 | **Answered for invoices → C-037, C-051** (nearest whole taka, half rounds up, shown as a rounding adjustment line). Still open: percentage-discount rounding (discounts are not in RP-A). |
| Q-021 | Refunds:<br>• approval levels<br>• refund method (same as original or any method)<br>• cash refund limits<br>• refund after service started | Money out of the hospital. | FR-BIL-018. | Finance | P2 | Refunds **not implemented** in slice 1. Cancellation before payment only. |
| Q-022 | Overpayment and patient advance: does excess money become patient credit (a deposit account) or must it be refunded immediately? | Balance correctness. | — | — | — | **Answered → C-038** (no overpayment; change given). |
| Q-023 | Invoice correction and "test restoration to the same invoice" (SRC-O03): when may a cancelled line be restored, and does it reuse the original invoice? | Invoice immutability vs operational convenience. | FR-BIL-020. | Finance + lab manager | P2 | Not implemented. A cancelled line stays cancelled; a new order creates a new line. |
| Q-024 | Can one payment be split across the doctor invoice and the service invoice in a single receipt? | Cashier speed vs receipt clarity. | — | — | — | **Answered → C-039** (one payment, several invoices, one receipt). |
| Q-040 | Does an IPD/OPD deposit carry across visits as a patient-level deposit account? | Account model. | FR-BIL-019, FR-IPD-008. | Finance | P3 | A deposit belongs to one admission or one visit invoice. |
| Q-029 | Finance scope:<br>• full general ledger in-product, or export to an external accounting system<br>• chart of accounts, period close<br>• "daily finalization" meaning (SRC-B07)<br>• bank reconciliation scope | The finance module cannot be specified without this. | All FR-FIN-* except the cashier day close. | Finance director | P4 | Only the cashier session/day-close and collection reports are specified ([C04](C-srs/C04-billing-payments.md)). |
| Q-045 | Payment gateway (e.g., bKash, card acquirer) integration in the first release, or manual recording of the method only? | Callback, pending-state and reconciliation design. | FR-BIL-021..023 (gateway path). | Product owner + finance | P1 | Manual recording only (C-010 methods are recorded; no online settlement). |
| Q-068 | When a payment method is corrected after the original cashier session has closed, which session or day shows the change: the original session, or the day of correction? | Collection reports must reconcile with physical cash and bank statements. | — | — | — | **Answered → C-043** (correction appears on the correction day; closed reports never change). |

## 5. Clinical, diagnostics and inpatient

| ID | Question | Why it matters | Blocks | Responder | Priority | Interim handling |
| --- | --- | --- | --- | --- | --- | --- |
| Q-007 | Bed rent rule:<br>• noon-to-noon or 6 p.m. posting (SRC-I07)<br>• partial days<br>• transfer day (which bed's rate)<br>• extra-bed rules<br>• cap (SRC-I06) | Daily IPD charges. Sources conflict (CX-005). | FR-IPD-009 (automatic bed charges). | Finance + IPD manager | P3 | No automatic bed charge. Authorized staff post bed charges manually through a priced service, with source reference. |
| Q-069 | Backdating: may staff enter an admission, transfer or departure with an effective time earlier than entry time? How far back, by whom, and how do charges and occupancy intervals react? | Occupancy intervals and charges depend on effective times. | FR-IPD-016. | IPD manager + finance | P3 | Effective time = server time. No backdating. |
| Q-008 | Does a bed vacated by a **transfer** (not discharge) also need cleaning before reuse? | Bed availability. | FR-IPD-006 variant. | Nursing/housekeeping lead | P3 | Configurable per tenant; synthetic default = cleaning required after any vacancy. **Labelled PROPOSED** default. |
| Q-009 | Lab authority:<br>• who enters, verifies and releases results<br>• are "prepared / verified / finalized / release" four steps or synonyms<br>• can one person verify and release<br>• who may skip a step | The release state machine and permissions. | FR-LAB-008..011. | Pathologist / lab manager | P2 | States are modeled as Entered → Verified → Released. Verify and release are separate permissions; same-person control is configurable and blocked by default. **This mapping is PROPOSED.** |
| Q-010 | Eosinophil count formula and rounding (SRC-L01). | Clinical correctness. | FR-LAB-015 calculated tests. | Pathologist | P2 | Calculated results **not implemented**. Values entered manually as reported. |
| Q-011 | Lab reference ranges, methods, PBF templates, the amendment process, and the state that "group report reversal" (SRC-L09) returns to. | Report content and correction. | FR-LAB-012..014, FR-LAB-016. | Pathologist | P2 | Ranges/templates are tenant configuration entered by the lab. Reversal is an amendment that creates a new version; the target state is OPEN. |
| Q-012 | Critical-result notification and acknowledgment workflow. | Patient safety. Printing ≠ doctor saw it. | FR-LAB-017. | Clinical lead | P2 | Not implemented. Critical flag displayed only. |
| Q-013 | May a released report be delivered (printed for the patient, portal, B2B) while dues are outstanding? | Report delivery gate. | FR-REP-006, FR-POR-003. | Finance + lab manager | P2 | Delivery is not blocked by dues (no rule invented). The dues status is displayed at the delivery desk. |
| Q-014 | Pharmacy:<br>• substitution rules<br>• pack/unit conversions<br>• partial dispensing<br>• batch selection (FEFO?)<br>• stock reservation<br>• post-discharge returns | Stock and billing correctness. | FR-PHA-004..009. | Chief pharmacist | P3 | Dispense exactly prescribed items in base units. Staff select the batch. No substitution. Returns only before final bill. |
| Q-015 | Pharmacy payment gate: OPD counter sales pay before issue? IPD issues post to the running account? | Integration with billing. | FR-PHA-003. | Finance + pharmacy | P3 | OPD: pay before issue. IPD: post to the running account. **PROPOSED** defaults, disabled until confirmed. |
| Q-058 | Does the pharmacy POS sell to walk-in customers who are not registered patients? | Patient identity requirement for sales. | FR-PHA-010. | Pharmacy + product owner | P4 | Not implemented. |
| Q-016 | Is nursing medication administration (MAR) in scope? | Nursing module depth. | FR-NUR-008. | Nursing director | P3 | Out of scope until answered. |
| Q-070 | Nursing observations: which vital signs and assessments, frequency, charting format, alerts? | Nurse station scope. No clinical thresholds are invented. | FR-NUR-010. | Nursing director | P3 | Not implemented. |
| Q-017 | Order cancellation:<br>• allowed stages (before payment, after payment, after sample collection, after result)<br>• who approves<br>• financial reversal (the X-ray Chest A/P case, SRC-N07) | Common daily correction. | FR-ORD-006, FR-BIL-020. | Clinical + finance | P2 | Cancel allowed only before payment and before work starts. |
| Q-018 | Medicine return sequence: nurse submits → pharmacy accepts → credit posted? Can credit precede acceptance? | Disputed returns (SRC-N11). | FR-NUR-005, FR-PHA-007. | Pharmacy + finance + nursing | P3 | Credit only after pharmacy acceptance (**PROPOSED**; confirm). |
| Q-025 | Emergency triage categories, escalation, clinical documentation depth. | Emergency module. | FR-EMG-002..006. | Emergency lead | P4 | Staff-entered priority from a tenant-configured list; no thresholds invented. |
| Q-026 | Daycare definition, resources (beds/chairs), maximum stay, discharge duties. | Occupancy consistency (SRC-I03). | FR-DAY-*. | Hospital operations | P4 | Not implemented. |
| Q-027 | OT: consent/checklists, anesthesia records, stage authority, team/room scheduling, package pricing. | OT module. | FR-OT-*. | OT lead + finance | P4 | Not implemented beyond the specified stages. |
| Q-028 | Radiology: modalities present, PACS/DICOM integration, who verifies/finalizes reports, report templates. | RIS module. | FR-RIS-*. | Radiology lead | P4 | Manual report entry, if adopted. |
| Q-060 | Discharge certificates, death certificates, newborn registration (SRC-I04): content, signatories, numbering. | Clinical-legal documents. Government aspects DEFERRED (DEF-001). | FR-IPD-014. | Medical director | P4 | Not implemented. |
| Q-066 | Consultation note content:<br>• sections<br>• coded diagnosis (which classification and version, or free text)<br>• OPD vital signs<br>• allergy capture detail | Clinical documentation quality, reporting. | FR-CLI-003, FR-CLI-007 content. | Medical director | P2 | Free-text sections (complaint, history, examination, assessment, advice). Allergy tri-state (FR-CLI-007). No coding. |
| Q-067 | Prescription field set:<br>• medicine catalogue structure (generic vs brand, strength/form)<br>• allowed free text<br>• dose/frequency vocabularies in Bangla and English | Prescription safety and printing. | FR-CLI-004. | Medical director + chief pharmacist | P2 | Catalogue-based lines with free-text instructions. Vocabularies entered by the hospital. |
| Q-061 | Package pricing, and package merge/split (SRC-I04). | IPD/OT billing. | FR-BIL-024. | Finance | P4 | Not implemented. |

## 6. Inventory, procurement, HR and other domains

| ID | Question | Why it matters | Blocks | Responder | Priority | Interim handling |
| --- | --- | --- | --- | --- | --- | --- |
| Q-063 | Inventory:<br>• negative stock allowed?<br>• valuation method (FIFO, weighted average)<br>• adjustment approval limits | Stock ledger rules. | FR-INV-003..006. | Store manager + finance | P3 | No negative stock (fixed rule proposed). Valuation not computed. |
| Q-064 | Procurement approval levels; receipt without PO allowed? | Purchasing controls. | FR-INV-008..011. | Finance + procurement | P4 | Not implemented. |
| Q-065 | Reagent consumption mapping rules per test/analyzer. | Reagent stock. | FR-REA-*. | Lab manager | P4 | Not implemented. |
| Q-030 | HR/payroll:<br>• salary structure, allowances, deductions<br>• overtime, leave rules<br>• attendance devices<br>• pay periods | The payroll module cannot be specified. Statutory parts DEFERRED (DEF-001). | All FR-HR-* beyond the employee record. | HR + finance | P4 | Only employee master data is specified. |
| Q-031 | Referral / "working share" / MPO formulas and whether to adopt them (SRC-C01). | Commission payments. | FR-REF-*. | Management + finance | P4 | Not implemented. |
| Q-032 | B2B client prices, credit terms, report dispatch rules. | B2B diagnostics. | FR-B2B-*. | Lab business manager | P4 | Not implemented. |
| Q-033 | Patient portal: identity verification and proxy rules, which reports are visible, delivery with dues (Q-013). | Privacy. | FR-POR-*. | Product owner + clinical lead | P4 | Not implemented. |

## 7. Technology and operations

| ID | Question | Why it matters | Blocks | Responder | Priority | Interim handling |
| --- | --- | --- | --- | --- | --- | --- |
| Q-041 | Does "100,000 users" mean registered accounts, daily active users or concurrent users? Staff only, or including portal patients? | Capacity planning (C-028). | — | — | — | **Answered → C-046** (total registered patient records over time). |
| Q-043 | Recovery and support objectives:<br>• acceptable data loss (RPO)<br>• restore time (RTO)<br>• support hours (24×7?)<br>• planned maintenance windows | Backup frequency, topology, on-call. | NFR-REC-001, NFR-AVAIL-001; RG-4. | Product owner + pilot | T | Proposed engineering targets are in [J §8](J-vps-deployment-operations.md#8-backups-and-tested-restoration), labelled PROPOSED. |
| Q-044 | VPS provider and region; provider object storage availability. Legal hosting constraints are DEFERRED (DEF-001). | Latency to Bangladesh hospitals; backups off-site. | J provider-specific runbooks. | Product owner + DevOps | T | Provider-neutral design. |
| Q-046 | Printers and devices:<br>• A4/A5 models<br>• label printer model and label size<br>• barcode symbology<br>• barcode scanners<br>• receipt printers? | Print templates and UAT. | FR-PRN-*, UAT device tests. | Pilot IT | P1 | **Device classes answered → C-044** (A4 laser, 80 mm thermal, barcode label printer). Models, label size and barcode symbology confirmed in device UAT. |
| Q-047 | Analyzer interfaces (EXL-200 and others): protocol, connection, sample ID matching; manual entry acceptable for the first release? | LIS integration. | FR-INT-002..005. | Lab manager + device vendor | P2 | Manual result entry. |
| Q-048 | Legacy data migration scope: patients, open balances, open admissions, stock batches, historical reports? | Cutover plan. | Migration tasks; RG-3. | Product owner + pilot | T | Fresh start with synthetic data; migration tooling designed but not built. |
| Q-049 | SMS / notification provider; patient notifications in scope? | Integration. | FR-INT-008. | Product owner | P4 | Not implemented. |
| Q-050 | Bilingual details:<br>• Bangla digits (০–৯) or Western digits on screen and print<br>• date format<br>• which print documents are bilingual vs single-language<br>• default language per user/tenant<br>• native-speaker terminology review | C-025 implementation. | FR-I18N-003..006. | Product owner + native-speaker reviewer | P1 | **Answered → C-036** (digits follow UI language; `dd-MM-yyyy`; print language per template). Native-speaker review still needed. |
| Q-053 | Operational retention durations for audit logs, backups and deleted-user data (non-statutory). Statutory retention is DEFERRED. | Storage growth, privacy. | NFR-RET-001. | Product owner | T | Keep everything; no automatic purge. |
| Q-054 | Test runner: keep Jest (supplied foundation) or switch to Vitest (NestJS 12's ESM default)? | Tooling consistency. | — | — | — | **Answered → ADR-018** (Vitest). |
| Q-055 | Which GitHub plan (Free / Team / Enterprise)? Organization or personal account? | Environment protection rules (required reviewers need Enterprise for private repos), secret scanning, gitleaks licence. | — | — | — | **Answered → C-047** (GitHub Free; repositories private; deploy keys). |
| Q-056 | Where is the SonarQube server hosted and who administers it? | Community Build needs ≥ 4 GB RAM and should not share the production VPS. | — | — | — | **Answered → C-048** (SonarQube server deferred; ESLint + SonarJS meanwhile). |

**Numbering note:** Q-057, Q-059 and Q-062 are intentionally unused, and the numbers are not reused, to keep IDs stable. While drafting:
- Q-057 (real-time worklist updates) became an engineering proposal (ADR-015).
- Q-059 (currency display decimals) was merged into Q-020.
- Q-062 (discharge facts) was merged into Q-006.

## 8. Questions closed in this version

| ID | Answer | Recorded as |
| --- | --- | --- |
| Q-002 | One hospital per customer initially; groups later. | C-024, DEF-002 |
| (v0.3 tech) CI/CD provider | GitHub Actions | C-022 |
| (v0.3 tech) SonarQube edition | Self-hosted Community Build | C-023 |
| (v0.3 tech) Languages | Bangla + English, user-switchable, bilingual prints | C-025 |
| Q-001 | RP-A: outpatient + diagnostics first. | C-031 |
| Q-003 (for RP-A) | Proposed role templates as the starting set. | C-045 |
| Q-004 (for RP-A) | No deposits in the first release. | C-040 |
| Q-020 (invoices) | Nearest whole taka, half rounds up, with a rounding adjustment line. | C-037, C-051 |
| Q-022 | No overpayment; change given. | C-038 |
| Q-024 | One payment may cover several invoices; one receipt. | C-039 |
| Q-034 | `{PREFIX}-{seq:6}`, continuous. | C-033 |
| Q-035 | Name, sex, age or DOB, mobile required. | C-034 |
| Q-037 | Fixed capacity, serial at check-in. | C-035 |
| Q-038 | New and follow-up fee per doctor. | C-041 |
| Q-039 | Cashier issues and collects. | C-042 |
| Q-041 | Registered patient records over time. | C-046 |
| Q-046 (device classes) | A4 laser, 80 mm thermal, barcode label printer. | C-044 |
| Q-050 | Digits follow UI language; `dd-MM-yyyy`. | C-036 |
| Q-051 | MFA admin + finance; 60 min idle / 12 h; lock 5 × 15 min. | C-032 |
| Q-054 | Vitest. | ADR-018 |
| Q-055 | GitHub Free; private repositories. | C-047 |
| Q-056 | SonarQube server deferred. | C-048 |
| Q-068 | Corrections on the correction day. | C-043 |

## 9. Recording an answer

```text
Question:       Q-0NN
Answer:
Answered by / role / date:
Recorded as:    C-0NN (A2)
Examples:       at least one synthetic worked example, e.g. for money or bed rules
Affected:       requirements, data, contracts, UI, tests, migrations, existing records
```

A task may proceed when the question does not affect its behavior. The task's "excluded behavior" section must name the question ID ([G §4](G-implementation-plan.md#4-definition-of-ready-and-definition-of-done)).
