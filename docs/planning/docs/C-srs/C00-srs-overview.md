# C00 — Software Requirements Specification: overview and shared rules

| Control | Value |
| --- | --- |
| Document | C00 SRS overview (conventions, actors, global rules, policy catalogue, permissions, errors) |
| Version | 0.4.0-draft |
| Status | Draft-for-review |
| Owner role | Technical architect + domain lead |
| Updated | 2026-10-12 |
| Depends on | [B BRD](../B-business-requirements.md), [A2](../A2-decision-register.md), [A3](../A3-open-questions.md) |
| Module files | [C01](C01-platform-access-audit.md) · [C02](C02-patients-scheduling.md) · [C03](C03-opd-clinical-orders.md) · [C04](C04-billing-payments.md) · [C05](C05-laboratory.md) · [C06](C06-ipd-beds-discharge.md) · [C07](C07-nursing.md) · [C08](C08-pharmacy.md) · [C09](C09-inventory-procurement-reagents.md) · [C10](C10-emergency-daycare.md) · [C11](C11-radiology-ot.md) · [C12](C12-finance-hr-payroll.md) · [C13](C13-reporting-printing-portal-b2b.md) · [C14](C14-integrations-devices.md) · [C15 NFR](C15-non-functional-requirements.md) |

## 1. Scope and structure

The SRS specifies observable behavior for the whole product (C-001). Detail is concentrated where sources and decisions support it: patients, scheduling, billing, lab, beds and nursing. Thin areas such as finance, payroll, OT and radiology are written as **explicit gap statements** rather than invented rules.

Each module file contains:
1. purpose and scope
2. actors
3. requirement table
4. use cases with preconditions, inputs, outputs, state transitions and normal / alternative / denied / cancellation / recovery paths
5. state machines
6. permissions and approvals
7. fixed rules vs configurable policies
8. Given/When/Then acceptance examples
9. traceability
10. gaps and open questions

## 2. Requirement conventions

- **ID:** `FR-<MODULE>-<nnn>`. v0.3 IDs (e.g., FR-BIL-001) keep their meaning. New IDs continue the numbering. IDs are never reused.
- **Status:** CONFIRMED / SOURCE-DERIVED / PROPOSED / OPEN / DEFERRED (see [A2 §1](../A2-decision-register.md#1-status-vocabulary)).
  - A requirement whose *capability* is confirmed but whose *rule values* are open is marked `CONFIRMED (values OPEN: Q-nnn)`.
  - A requirement whose behavior cannot be specified is marked **OPEN**. It must not be implemented beyond the stated interim handling.
- **Wording:** "shall" marks a requirement; "should" marks a recommendation; "may" marks an option.
- **Verification method:**
  - **T**: automated test ([H](../H-automated-test-plan.md))
  - **U**: manual/UAT ([I](../I-manual-test-uat-plan.md))
  - **I**: inspection or code review
  - **A**: analysis or measurement (load test, query plan, restore drill)
- **Source:** decision IDs (C-*), source requirement IDs (SRC-*, defined in the baseline [SOURCE_REQUIREMENTS](../../baseline/hospital-saas-planning-kit-v0.3/docs/SOURCE_REQUIREMENTS.md)) and proposals (P-*).
- **Amounts in examples** are synthetic (for example D = 500.00 BDT) and are test fixtures, not real prices.

## 3. Actors

| Actor | Type | Description |
| --- | --- | --- |
| Receptionist | Staff | Front desk registration, scheduling, check-in, direct diagnostic ordering. |
| Cashier | Staff | Records payments, prints receipts, runs a cashier session. |
| Billing supervisor | Staff | Approves billing corrections within configured limits (rules OPEN). |
| Doctor | Staff (clinician) | Consults, orders, prescribes, admits, discharges medically, signs clinical documents. |
| Nurse | Staff (clinician) | Ward worklist, indents, returns, permitted observations. |
| Lab technologist | Staff | Collects, receives, rejects specimens; enters results. |
| Lab authority | Staff (clinician) | Verifies, releases, amends results (mapping OPEN, Q-009). |
| Pharmacist / pharmacy staff | Staff | Dispenses, accepts returns. |
| Store keeper | Staff | Stock receipt, transfers, adjustments (approval separate). |
| Radiology / OT / emergency / Daycare staff | Staff | Module-specific actions (later modules). |
| Finance officer | Staff | Reconciliation, financial reports, day close review. |
| HR officer | Staff | Employee records. |
| Hospital administrator | Staff | Users, roles, configuration, price lists, templates. Not automatically clinical. |
| Management viewer | Staff | Read-only dashboards and reports. |
| Patient / proxy | External | Portal (later, Q-033). |
| System worker | System | Background jobs acting under a recorded originating actor or system identity. |
| External system | System | Analyzer, payment provider, SMS gateway (through adapters, C14). |

## 4. Global preconditions for every command and query

Unless a use case says otherwise, every request shall satisfy all of these **on the server** (C-029):

1. **GP-1 Authenticated session:** the session is valid, not expired and not revoked (FR-ACC-001).
2. **GP-2 Active membership:** the session's membership is active and the user is not locked (FR-ACC-010).
3. **GP-3 Facility/department scope:** the record is within the membership's permitted facility and, where configured, department scope. A record outside it is reported as *not found* (no existence leak).
4. **GP-4 Permission:** the user holds the specific permission code (§8). Menu visibility is irrelevant.
5. **GP-5 State:** the target record is in a state that allows the transition, and the client's expected version matches (optimistic concurrency) for state-changing commands.
6. **GP-6 Trusted values:** amounts, prices, signer identity and timestamps of record are computed or read on the server. Client-supplied values for these fields are ignored or rejected.

## 5. Global fixed product rules (apply in every installation; not configurable)

| ID | Rule | Basis |
| --- | --- | --- |
| FPR-02 | Appointments, visits, admissions and bed occupancies are distinct records with separate lifecycles. | C-007, C-014 |
| FPR-03 | The doctor-fee invoice and the outpatient service invoice are separate invoices with independent balances. A payment allocated to one never changes the other's balance. | C-008 |
| FPR-04 | Each payment keeps the method actually used. Corrections keep the original. | C-010, SRC-B04 |
| FPR-05 | A prescription never moves hospital stock. Only dispensing does. Outside fulfilment never moves stock. | C-012 |
| FPR-06 | Posted charges, payments, allocations, stock movements, released results and signed clinical documents are never edited or deleted. Corrections are new records (reversal, adjustment, amendment) linked to the original. | C-029, P-013 |
| FPR-07 | Viewing, printing, exporting or navigating never changes a record's business state. | SRC-L12–L15 |
| FPR-08 | A repeated identical command (same idempotency key and payload) returns the original outcome without repeating side effects. A different payload under the same key is rejected. | C-029 |
| FPR-09 | A source event posts at most one charge (unique source posting reference). | SRC-B06 |
| FPR-10 | A physical bed has at most one active occupancy at any instant. A bed vacated by discharge is unavailable until cleaning is recorded. | C-016, P-012 |
| FPR-11 | Money is exact decimal with explicit currency. No floating-point arithmetic. Rounding happens only where a configured rule says so. | P-011 |
| FPR-12 | Every sensitive action is audited with actor, target, version, time and outcome. | C-029 |
| FPR-13 | The software never decides clinical need, triage category, diagnosis or dose. Staff record decisions; the software records who and when. | C-015, C-027 |
| FPR-14 | No patient may be merged automatically. | Identity agreements |
| FPR-15 | Displayed "saved" or "success" feedback appears only after the server confirms the commit. | SRC-I05, DESIGN |

## 6. Fixed product rules versus configurable hospital policies

Configurable policies are **hospital configuration with effective dates and versions** (P-004, FR-CFG-002). A record keeps the policy version in force when it was created. A policy whose *values* are OPEN ships with the safest interim value listed here, labelled PROPOSED. Changing it requires a hospital administrator with `admin.config.publish`.

| ID | Configurable policy | Scope | Interim / default value | Status | Owner question |
| --- | --- | --- | --- | --- | --- |
| CP-01 | Directly orderable tests (reception may order without consultation) | Per test | No test directly orderable until configured | CONFIRMED capability (C-006) | — |
| CP-02 | Payment eligibility rule per service | Per service / category | `FULL_PAYMENT` | CONFIRMED capability (C-011); deposit values OPEN | Q-004 |
| CP-03 | Deposit rules (minimum, which services, allocation order) | Per service category | Disabled | OPEN | Q-004, Q-040 |
| CP-04 | Emergency payment exceptions | Per facility | Disabled | OPEN | Q-005 |
| CP-05 | Price lists (services, tests, doctor fees) | Per hospital, effective-dated | Must be configured before go-live | CONFIRMED capability | Q-038 |
| CP-06 | Discount reasons, limits, approvers | Per role | Discounts disabled | OPEN | Q-019 |
| CP-07 | Rounding rule for invoices/receipts | Per hospital | Nearest whole taka on the invoice total, with a rounding adjustment line; lines exact to 2 decimals | CONFIRMED (C-037, C-051: half rounds up) | Q-020 |
| CP-08 | Refund approval levels and methods | Per hospital | Refunds disabled | OPEN | Q-021 |
| CP-09 | MRN / invoice / receipt / specimen numbering patterns | Per document type | MRN `{PREFIX}-{seq:6}`, continuous (e.g. `SMH-000123`); other documents synthetic | MRN CONFIRMED (C-033); other formats OPEN | Q-034 |
| CP-10 | Required registration fields (above product minimum) | Per hospital | Name (Bangla or English), sex, age or DOB, mobile (empty only if none); address optional | CONFIRMED (C-034) | Q-035 |
| CP-11 | Slot capacity, overbooking, queue numbering | Per schedule | Fixed capacity, no overbooking, serial at check-in, walk-ins in the same queue | CONFIRMED (C-035) | Q-037 |
| CP-12 | Session timeouts, lockout threshold, MFA roles | Per hospital | Idle 60 min, absolute 12 h, lockout after 5 failures for 15 min (admin may unlock sooner), MFA for admin/finance roles | CONFIRMED (C-032) | Q-051 |
| CP-13 | Lab verify/release separation (same person allowed?) | Per test category | Same person **not** allowed | OPEN | Q-009 |
| CP-14 | Lab reference ranges, methods, templates, units | Per test version | Entered by lab; no product defaults | CONFIRMED capability (FR-LAB-003) | Q-011 |
| CP-15 | Bed cleaning required after transfer vacancy | Per hospital | Required | OPEN | Q-008 |
| CP-16 | Bed-rent rule | Per hospital | No automatic charge; manual posting | OPEN | Q-007 |
| CP-17 | Report delivery allowed with outstanding dues | Per report type | Allowed, dues shown | OPEN | Q-013 |
| CP-18 | UI default language; print language per template; digits; date format | Per hospital / user / template | User choice; digits follow the UI language (Bangla UI → Bangla digits); `dd-MM-yyyy`; print language per template | CONFIRMED (C-025, C-036) | Q-050 |
| CP-19 | Print templates (A4/A5/label sizes, header, logo) | Per document type | Product templates for A4 and 80 mm thermal; barcode labels for specimens | CONFIRMED capability (SRC-Q01); device classes C-044 | Q-046 |
| CP-20 | Pharmacy OPD payment gate / IPD posting | Per hospital | OPD pay-before-issue; IPD to running account (disabled until confirmed) | OPEN | Q-015 |
| CP-21 | Medicine return acceptance before credit | Per hospital | Credit after acceptance | OPEN | Q-018 |
| CP-22 | Order cancellation allowed stages and approvers | Per service category | Before payment and before work only | OPEN | Q-017 |
| CP-23 | Emergency priority category list | Per facility | Hospital-defined list, no product defaults | OPEN | Q-025 |
| CP-24 | Segregation-of-duty pairs (e.g., issuer ≠ collector) | Per hospital | None enforced; cashier may both issue and collect | CONFIRMED (C-042) | Q-039 |

## 7. Standard paths applied to every state-changing command

Each use case lists only its specific paths and refers to these standard ones by ID.

| ID | Situation | Required behavior | Error code |
| --- | --- | --- | --- |
| SP-01 | **Duplicate submission** (double-click, retry after timeout) with the same idempotency key and identical payload | Return the original result. No new side effect. | — (original response, `Idempotent-Replay: true` header) |
| SP-02 | Same idempotency key, **different payload** | Reject. Nothing changes. | `IDEMPOTENCY_KEY_REUSED` |
| SP-03 | **Stale version** (another user changed the record) | Reject. The UI reloads and shows what changed. | `STALE_RECORD` |
| SP-04 | **Permission denied** | Reject. Audit sensitive denials (FR-AUD-002). The UI shows "You do not have permission to …" without revealing data. | `PERMISSION_DENIED` |
| SP-05 | **Out of scope** (other facility, non-existent) | Reject as not found. | `NOT_FOUND` |
| SP-06 | **Invalid transition** (state does not allow it) | Reject with current state. | `INVALID_TRANSITION` |
| SP-07 | **Validation failure** (missing or invalid field) | Reject with field-level messages in the user's language. | `VALIDATION_FAILED` |
| SP-08 | **Uncertain outcome** (network timeout; client does not know if the server committed) | The client re-sends with the **same** idempotency key, or queries status by key. It never creates a new key for the same intent. | — |
| SP-09 | **Server/database unavailable** | Nothing is committed (transaction rolled back). The UI shows "Not saved — try again" and keeps the form data. | `SERVICE_UNAVAILABLE` |
| SP-10 | **Concurrent conflicting command** (two cashiers, two bed allocations) | Exactly one succeeds. The other gets SP-03 or a domain-specific code (`BED_UNAVAILABLE`, `AMOUNT_EXCEEDS_BALANCE`). | as stated |
| SP-11 | **Session expired mid-form** | The form is kept locally (no business data in persistent browser storage). After re-login the user resubmits with the same idempotency key. | `UNAUTHENTICATED` |
| SP-12 | **Cancellation by user before submit** | Nothing is sent. Unsaved-changes warning on navigation. | — |

## 8. Permission catalogue and approval responsibilities

**Status:**
- The permission *codes* are PROPOSED.
- The *separation* of these rights is CONFIRMED (C-029, v0.3 ACCESS_CONTROL).
- *Which role* receives each code is OPEN (Q-003).

The "Default template" column lists the proposed role templates (RCP = Receptionist, CSH = Cashier, BSV = Billing supervisor, DOC = Doctor, NUR = Nurse, LBT = Lab technologist, LBA = Lab authority, PHA = Pharmacy, STK = Store keeper, FIN = Finance, ADM = Hospital administrator, MGT = Management viewer). "Approval" marks actions that are themselves approvals or need an approver.

| Permission code | Action | Default template | Approval | FR |
| --- | --- | --- | --- | --- |
| `patient.record.search` | Search patients | RCP, CSH, DOC, NUR, LBT, LBA, PHA | — | FR-PAT-001 |
| `patient.record.register` | Register a patient | RCP | — | FR-PAT-002 |
| `patient.identity.edit` | Edit identity fields | RCP (limited fields), ADM | Reason required | FR-PAT-008 |
| `patient.identity.reconcile` | Link a temporary identity to a known patient | ADM (proposed) | Yes (Q-036) | FR-PAT-004 |
| `patient.sensitive.view` | View unmasked NID | ADM, RCP (proposed) | Audited read | FR-PAT-007 |
| `practitioner.manage` | Create/edit practitioners | ADM | — | FR-PRA-001 |
| `scheduling.schedule.manage` | Manage schedules/sessions | ADM, RCP (proposed) | — | FR-SCH-002 |
| `scheduling.appointment.book` | Book/reschedule/cancel | RCP | — | FR-SCH-002 |
| `visit.checkin` | Check in an appointment | RCP | — | FR-VIS-002 |
| `visit.create` | Create walk-in / diagnostic visit | RCP | — | FR-VIS-001 |
| `order.direct_diagnostic.create` | Reception direct test orders | RCP | Per-test policy CP-01 | FR-ORD-001 |
| `order.service.create` | Clinician orders | DOC | — | FR-ORD-002 |
| `order.service.cancel` | Cancel an order | DOC, RCP (before payment) | Stage rules (Q-017) | FR-ORD-006 |
| `clinical.consultation.record` | Write consultation note | DOC | — | FR-CLI-003 |
| `clinical.document.sign` | Sign clinical document | DOC | — | FR-CLI-003 |
| `clinical.document.amend` | Amend signed document | DOC (author) | Reason required | FR-CLI-003 |
| `clinical.prescription.create` | Create/sign prescription | DOC | — | FR-CLI-004 |
| `billing.invoice.issue` | Issue invoices / add lines | RCP, CSH (Q-039) | — | FR-BIL-007 |
| `billing.payment.record` | Record payment and print receipt | CSH | — | FR-BIL-011 |
| `billing.payment.method_correct` | Correct a payment method | BSV | Yes, reason | FR-BIL-025 |
| `billing.discount.apply` / `billing.discount.approve` | Discounts | BSV | Yes (Q-019) | FR-BIL-013/014 |
| `billing.refund.request` / `billing.refund.approve` | Refunds | CSH / BSV | Yes (Q-021) | FR-BIL-018 |
| `billing.line.cancel` | Cancel/reverse an invoice line | BSV | Yes (Q-017) | FR-BIL-020 |
| `billing.eligibility.override` | Emergency exception | — (disabled) | Yes (Q-005) | FR-BIL-016 |
| `billing.cashier_session.manage` | Open/close own session | CSH | — | FR-BIL-026 |
| `billing.cashier_session.review` | Review/accept variances | FIN | Yes | FR-BIL-026 |
| `lab.specimen.collect` / `lab.specimen.receive` / `lab.specimen.reject` | Specimen handling | LBT | — | FR-LAB-004..007 |
| `lab.result.enter` | Enter results | LBT | — | FR-LAB-008 |
| `lab.result.verify` | Verify | LBA | Approval (Q-009) | FR-LAB-009 |
| `lab.result.release` | Release | LBA | Approval (Q-009) | FR-LAB-010 |
| `lab.result.amend` | Amend released result | LBA | Reason; approval (Q-011) | FR-LAB-012 |
| `lab.config.manage` | Tests, ranges, templates | LBA, ADM | Publish is versioned | FR-LAB-016 |
| `lab.report.deliver` | Record report delivery | RCP (delivery desk), LBT | — | FR-LAB-022 |
| `ipd.admission.create` | Create admission | RCP, DOC (admission request) | — | FR-IPD-001 |
| `ipd.bed.allocate` / `ipd.bed.transfer` | Allocate / transfer | NUR (ward in-charge), RCP (admission desk) | — | FR-IPD-002, FR-IPD-007 |
| `ipd.bed.cleaning.complete` | Mark cleaning complete | NUR / housekeeping | — | FR-IPD-003 |
| `ipd.discharge.medical` | Medical discharge | DOC | — | FR-IPD-011 |
| `ipd.discharge.financial_clear` | Financial clearance | CSH / BSV | Policy Q-006 | FR-IPD-012 |
| `ipd.discharge.depart` | Record departure | NUR, RCP | — | FR-IPD-013 |
| `nursing.worklist.view` | Ward worklist | NUR | — | FR-NUR-001 |
| `nursing.indent.manage` | Create/edit indents | NUR | — | FR-NUR-004 |
| `nursing.return.submit` | Submit medicine return | NUR | — | FR-NUR-005 |
| `pharmacy.dispense` | Dispense | PHA | — | FR-PHA-004 |
| `pharmacy.return.accept` | Accept return | PHA | Approval of quantity | FR-PHA-007 |
| `inventory.stock.adjust.request` / `.approve` | Stock adjustment | STK / store manager | Yes | FR-INV-004 |
| `inventory.transfer.dispatch` / `.receive` | Transfers | STK | — | FR-INV-005 |
| `inventory.grn.receive` | Goods receipt against PO | STK | — | FR-INV-009 |
| `report.view.<area>` | View reports by area | Varies | — | FR-REP-004 |
| `report.export` | Export to file | FIN, ADM, MGT | Audited | FR-REP-004 |
| `admin.user.manage` | Users and memberships | ADM | — | FR-ACC-008 |
| `admin.role.manage` | Roles and permissions | ADM | Audited | FR-ACC-008 |
| `admin.config.publish` | Publish configuration/policy versions | ADM | Audited; effective date | FR-CFG-002 |
| `admin.price.publish` | Publish price list versions | ADM / FIN | Audited | FR-CFG-002 |
| `audit.view` | View hospital audit log | ADM | — | FR-AUD-005 |

**Approval responsibilities:**
- An approval is recorded as its own event, with approver, time, reason and the approved record's version.
- An approver cannot approve their own request when a segregation rule (CP-13, CP-24) applies.
- **Approval rules whose values are OPEN are disabled, not guessed.** For example, discount limits stay disabled until Q-019 is answered.

## 9. Standard error codes

Codes are stable strings in [`packages/contracts`](../D-system-design.md#8-api-event-contracts-and-canonical-schema-strategy). They are mapped to HTTP status in D §8.3. Messages are localized (bn/en).

`UNAUTHENTICATED`, `PERMISSION_DENIED`, `NOT_FOUND`, `VALIDATION_FAILED`, `INVALID_TRANSITION`, `STALE_RECORD`, `IDEMPOTENCY_KEY_REUSED`, `PAYMENT_NOT_ELIGIBLE`, `AMOUNT_EXCEEDS_BALANCE`, `BED_UNAVAILABLE`, `BED_NEEDS_CLEANING`, `CAPACITY_FULL`, `INSUFFICIENT_STOCK`, `BATCH_EXPIRED`, `POLICY_NOT_CONFIGURED`, `SEGREGATION_OF_DUTY`, `ACCOUNT_LOCKED`, `SERVICE_UNAVAILABLE`, `FEATURE_NOT_AVAILABLE` (behavior blocked by an OPEN question), and from T-ACC-01: `INVALID_CREDENTIALS` (wrong username or password, same answer for both), `CSRF_TOKEN_INVALID` (missing token or disallowed origin on a write), `MEMBERSHIP_NOT_ACTIVE` (no active access), `INTERNAL_ERROR` (unexpected failure; no details are sent to the client), and proposed with T-PLT-07: `PAYLOAD_TOO_LARGE` (request body over the limit), `RATE_LIMITED` (too many requests for this session; retry later).

`FEATURE_NOT_AVAILABLE` is deliberately visible: when a user tries an action whose rule is OPEN (for example a refund before Q-021), the UI says the hospital has not configured it. It does not offer a guessed workflow.

## 10. Use case format

```text
UC-<MOD>-nn  Title
Actors / permission:
Preconditions:           (in addition to GP-1..GP-8)
Trigger:
Inputs:                  (client-supplied; trusted values computed on server)
Normal path:             numbered steps
Outputs:                 records created/changed, events, prints
State transitions:
Alternative paths:       A1, A2 …
Denied paths:            D1 … (plus SP-04/SP-05)
Cancellation:            C1 …
Recovery:                R1 … (plus SP-01/SP-08/SP-09)
Requirements:            FR-… 
```

## 11. Traceability

Each module file ends with a traceability table: requirement → decision/source → API command → data entity → permission → test IDs. The consolidated objective-to-gate chains and readiness state are in [N](../N-traceability-readiness.md).
