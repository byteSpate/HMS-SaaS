# C04 — Patient billing, payments, cashier sessions and IPD running account

| Control | Value |
| --- | --- |
| Module | `mod-billing` (charges, invoices, payments, allocations, receipts, cashier sessions, deposits, corrections) |
| Version | 0.4.0-draft |
| Status | Invoice model, cashier collection, methods and payment-first CONFIRMED. Deposits, discounts, refunds, rounding, overpayment and settlement OPEN (each disabled until answered). |
| Domain reviewer | Finance lead + cashier lead |
| Sources | C-008..C-011, C-017, C-029; SRC-B01..B07, SRC-O03; v0.3 FINANCIAL_RULES, BILLING_PAYMENTS. Billing source requirements come **via the S6/S7 consolidation** (CX-007). |

## 1. Purpose and scope

Billing owns every amount the hospital charges a patient and every payment it receives. That covers:
- pricing
- charges with unique source references
- invoices
- payments
- allocations
- receipts
- cashier sessions
- the IPD running account and final bill
- corrections

Other modules **request** charges through billing's interface. They never write billing tables (v0.3 MODULES rule).

**Out of scope:**
- the hospital general ledger (C12, Q-029)
- SaaS subscription invoices (DEF-006)
- tax (AS-014)

## 2. Actors

Cashier, receptionist (invoice issue if Q-039 allows), billing supervisor, finance officer, any module (as a system caller posting charges), doctor (denied payment recording).

## 3. Core money rules (summary; authoritative rules are the requirement rows)

1. Doctor-fee invoice **D** and service invoice **S** are separate documents with independent balances (C-008).
2. A payment belongs to one invoice (interim, Q-024). It is allocated to specific invoice lines (P-020). Eligibility is computed per line.
3. Interim eligibility: a line is eligible only when **fully** allocated (CP-02 = `FULL_PAYMENT`). Deposit eligibility is disabled until Q-004.
4. Amounts are exact to 2 decimals (AS-001). No rounding until Q-020.
5. Nothing posted is edited. Corrections are new records (FPR-06).

## 4. Requirements

| ID | Requirement | Status | Verify | Source |
| --- | --- | --- | --- | --- |
| FR-BIL-001 | Outpatient services of a visit shall be billed on **one combined service invoice** (type `SERVICE`) per visit. The doctor's visit fee is on a **separate** invoice (type `DOCTOR_FEE`). They have different invoice numbers, totals, balances and receipts. | CONFIRMED | T | C-008 |
| FR-BIL-002 | Only users with `billing.payment.record` (cashier) may record payments, including for the doctor-fee invoice. A doctor's worklist access grants no payment right. | CONFIRMED | T | C-009 |
| FR-BIL-003 | A service shall start only when its invoice line is **eligible** under the policy version in force: fully paid (`FULL_PAYMENT`), or a permitted deposit rule satisfied (`DEPOSIT`, OPEN), or an authorized exception (`EXCEPTION`, OPEN). Eligibility is evaluated on the server at the moment of `StartService`. | CONFIRMED (deposit and exception values OPEN: Q-004, Q-005) | T | C-011 |
| FR-BIL-004 | Each payment shall store the actual method (`CASH`, `CARD`, `MOBILE`, `BANK_TRANSFER`), an optional provider label (e.g., "bKash"), an optional external reference, and the amount. Reports always show the stored method. | CONFIRMED | T | C-010, SRC-B04 |
| FR-BIL-005 | Discounts, refunds and corrections shall be authorized, audited, linked to the original records and reconcile in all reports. | CONFIRMED principle (SRC); each feature OPEN | T | SRC-O03, SRC-B02 |
| FR-BIL-006 | A charge shall carry a unique source posting reference `(tenant, source_module, source_type, source_id, source_event)`. A repeated posting of the same reference shall return the existing charge and create nothing new. | SOURCE-DERIVED (adopted as fixed rule FPR-09) | T | SRC-B06 |
| FR-BIL-007 | Issuing an invoice or adding a line requires `billing.invoice.issue`, or happens automatically through the charge interface. The **price comes from the server** (price list version in force at the charge's service time). Client-supplied prices are ignored. | CONFIRMED (GP-8); who issues OPEN (Q-039) | T | v0.3 API_CONTRACTS |
| FR-BIL-008 | Invoice status shall be derived from its lines and allocations:<br>• `ISSUED` (balance = total > 0)<br>• `PARTIALLY_PAID`<br>• `PAID` (balance = 0, total > 0)<br>• `CANCELLED` (all lines cancelled before any allocation)<br>A `PAID` service invoice returns to `PARTIALLY_PAID` when a new line is added. | PROPOSED | T | — |
| FR-BIL-009 | New orders on the same OPD visit shall add lines to that visit's existing service invoice. If none exists, it is created. Previously eligible lines stay eligible. | CONFIRMED consequence of C-008 | T | C-008 |
| FR-BIL-010 | For an `OPD_CONSULTATION` visit, the doctor-fee invoice shall be issued automatically at visit creation/check-in from the practitioner's fee in the price list (`DOCTOR_FEE` item). If no fee is configured, the visit is created and the missing fee is reported (`POLICY_NOT_CONFIGURED`). | PROPOSED timing; fee rules OPEN (Q-038) | T | C-008, Q-038 |
| FR-BIL-011 | Recording a payment shall, in **one transaction**:<br>• validate the cashier's open session (FR-BIL-026)<br>• validate the invoice state, method and amount<br>• create the payment<br>• create allocations to the lines the cashier selected<br>• update the derived line eligibility and invoice balance<br>• generate the receipt number<br>• write the audit event and outbox `PaymentRecorded`<br>An idempotency key is required (FPR-08). | CONFIRMED (C-009, C-029); mechanism PROPOSED | T | v0.3 SYSTEM_DESIGN |
| FR-BIL-012 | **Interim allocation rule:**<br>• the cashier allocates explicitly to lines of the selected invoice<br>• the UI pre-selects all unpaid lines in line order for full payment<br>• partial amounts must be assigned to a specific line by the cashier<br>• the sum of allocations equals the payment amount<br>• no line may be over-allocated<br>Automatic allocation order and cross-invoice payments are OPEN. | PROPOSED interim (P-020); policy OPEN (Q-004, Q-024) | T | C-011 |
| FR-BIL-013 | Discounts (item-wise and bill-level) with configured reasons. | OPEN (Q-019). **Not available**: `FEATURE_NOT_AVAILABLE`. | — | SRC-O03, SRC-B02 |
| FR-BIL-014 | Discount approval workflow with role limits and the running bill shown to the approver. | OPEN (Q-019) | — | SRC-B02 |
| FR-BIL-015 | Authorized reduction of the doctor consultation fee. | OPEN (Q-038) | — | SRC-B02 |
| FR-BIL-016 | Emergency eligibility exception (treat before payment) with authorizer and later settlement. | OPEN (Q-005) | — | C-011 |
| FR-BIL-017 | Rounding and an explicit fraction-adjustment line. Interim: no rounding; totals exact to 2 decimals. | OPEN (Q-020) | T (interim) | SRC-B05 |
| FR-BIL-018 | Refunds with request and approval, method, and link to the original payment. | OPEN (Q-021). Not available. | — | SRC-O03 |
| FR-BIL-019 | Overpayment and patient advance (deposit account). Interim: a payment amount above the selected lines' remaining balance is rejected with `AMOUNT_EXCEEDS_BALANCE`. | OPEN (Q-022, Q-040) | T (interim) | C-011 |
| FR-BIL-020 | Invoice line cancellation and reversal:<br>• Interim: an unallocated line may be cancelled when its order is cancelled (FR-ORD-006). It stays visible and is excluded from totals.<br>• Reversal after allocation and restoration to the same invoice are OPEN. | Interim PROPOSED; rest OPEN (Q-017, Q-023) | T | SRC-O03, SRC-N07 |
| FR-BIL-021 | Online gateway payments with states `PENDING`, `CONFIRMED`, `FAILED`, `UNKNOWN`. Only `CONFIRMED` allocates. | OPEN (Q-045). Designed in D §13, not built. | — | v0.3 INTEGRATIONS |
| FR-BIL-022 | Gateway callbacks: verified signatures, deduplicated by provider reference, never trusting browser redirects. | OPEN (Q-045) | — | v0.3 INTEGRATIONS |
| FR-BIL-023 | Reconciliation of uncertain gateway outcomes before any retry or refund. | OPEN (Q-045) | — | v0.3 FINANCIAL_RULES |
| FR-BIL-024 | Packages (bundled prices), merge/split. | OPEN (Q-061) | — | SRC-I04 |
| FR-BIL-025 | Payment-method correction:<br>• the original payment stays unchanged<br>• a `payment_method_correction` record stores old method, new method, reason, requester and approver (`billing.payment.method_correct`)<br>• reports show the corrected method with a "corrected" marker and can show the original<br>Which session or day the correction affects is OPEN (Q-068). | SOURCE-DERIVED; reporting date OPEN | T | SRC-B04 |
| FR-BIL-026 | Cashier session:<br>• a cashier opens a session (opening float optional)<br>• all payments are recorded in an open session<br>• closing records counted amounts per method and computes expected vs counted and the variance<br>• a finance user reviews and accepts the variance with a note<br>A closed session cannot receive payments. | SOURCE-DERIVED (SRC-B07 daily finalization); details PROPOSED | T, U | SRC-B07 |
| FR-BIL-027 | Receipts:<br>• printed from the payment record<br>• a reprint is marked "Copy n" and audited<br>• a reprint never creates a payment<br>• the receipt shows invoice type (doctor fee or service), lines paid, amount, method, cashier, time and remaining invoice balance | CONFIRMED (C-008 separation); layout PROPOSED | T, U | SRC-Q01 |
| FR-BIL-028 | IPD running account: each admission has one `IPD_RUNNING` invoice. All IPD charges post to it with source references. Interim deposits and partial payments are recorded against it. The current running bill (charges, payments, balance) is visible at any time to permitted users. | CONFIRMED (C-017) | T | C-017, SRC-B02 |
| FR-BIL-029 | Final bill: issuing it freezes the running account for new routine charges. It shows charges by category, accepted returns, adjustments and every payment **exactly once**, and the balance due or credit. Late charges after the final bill require a supplementary bill (PROPOSED). Settlement and discharge-with-dues are OPEN (Q-006). | CONFIRMED (C-017); settlement OPEN | T | C-017 |
| FR-BIL-030 | Medicine and non-medicine charges shall have independent subtotals, and later independent discounts (when Q-019 allows). Accepted medicine returns reduce net medicine charges through credit lines. | SOURCE-DERIVED | T | SRC-B03 |
| FR-BIL-031 | Invoice totals, report summaries and receipts shall be computed from the same posted lines and allocations. Summary always equals detail, and line order is consistent across views. | SOURCE-DERIVED (adopted) | T | SRC-B05 |
| FR-BIL-032 | The running bill shall be visible before any discount is decided (for when discounts are enabled). | SOURCE-DERIVED | U | SRC-B02 |
| FR-BIL-033 | Charge interface for other modules: `PostCharge(sourceRef, patientId, visitId \| admissionId, catalogueItemId, quantity, serviceTime, requestedBy)`. Billing selects the target invoice and price. It returns the charge and line IDs. Idempotent by `sourceRef`. | PROPOSED (ownership CONFIRMED) | T | v0.3 MODULES |
| FR-BIL-034 | Concurrent payments on the same invoice shall never allocate more than a line's net amount. One request succeeds; the other receives `AMOUNT_EXCEEDS_BALANCE` or `STALE_RECORD`. | CONFIRMED (C-029) | T | v0.3 FINANCIAL_RULES |
| FR-BIL-035 | Balances and eligibility shown in any UI shall come from the server after commit. The browser never computes authoritative totals. | CONFIRMED (v0.3 DATA) | T, I | v0.3 |
| FR-BIL-036 | Billing errors shown to cashiers shall state what was saved. For an uncertain outcome (timeout), the UI shall offer "Check status", which queries by idempotency key, and shall not offer "Pay again". | CONFIRMED (v0.3 DESIGN) | T, U | SRC-B01 |

## 5. Use cases

### UC-BIL-01 Record payment for the doctor-fee invoice (cashier)

- **Actor / permission:** cashier (`billing.payment.record`) with an open cashier session.
- **Preconditions:** invoice D is `ISSUED` or `PARTIALLY_PAID` in the tenant; the cashier session is `OPEN`.
- **Inputs:**
  - invoice ID and expected invoice version
  - method, amount, provider label/reference (optional)
  - line allocations (pre-filled)
  - idempotency key
- **Normal path:**
  1. The cashier finds the patient (MRN, name, phone or visit token). The cashier desk shows the visit's invoices side by side: D (doctor fee) and S (services), each with total, paid and balance.
  2. The cashier selects D. The UI pre-fills full payment of D's single line.
  3. The cashier selects the method and confirms.
  4. The server executes FR-BIL-011.
  5. The UI shows "Payment saved — receipt RCPT-2026-000045" and D's new balance (0.00), and opens the print dialog.
- **Outputs:** `payment`, `payment_allocation`, `receipt`, updated D balance, audit `billing.payment.recorded`, outbox `PaymentRecorded`. The doctor worklist moves the patient to `WAITING`.
- **State transitions:** D `ISSUED → PAID`; line eligibility `NOT_ELIGIBLE → ELIGIBLE`.
- **Alternative paths:**
  - A1: partial payment of D (e.g., 200 of 500): recorded; D becomes `PARTIALLY_PAID`; the line stays not eligible under `FULL_PAYMENT`.
  - A2: the patient pays D and S at once → two separate payments and two receipts (interim, Q-024). The UI offers "Next: Service invoice" to keep it fast.
- **Denied paths:**
  - D1: the user is a doctor without the cashier permission → SP-04.
  - D2: no open session → `INVALID_TRANSITION` ("Open your cashier session").
  - D3: amount > balance → `AMOUNT_EXCEEDS_BALANCE`.
  - D4: invoice `CANCELLED` → `INVALID_TRANSITION`.
- **Cancellation:** C1: the cashier cancels before confirming → nothing sent.
- **Recovery:**
  - R1: timeout → "Check status" (FR-BIL-036) uses the same key and reveals whether the payment exists.
  - R2: printer failure → reprint from the receipt record (FR-BIL-027). No new payment.
  - R3: concurrent payment by another cashier → SP-10.
- **Requirements:** FR-BIL-001, FR-BIL-002, FR-BIL-004, FR-BIL-011, FR-BIL-012, FR-BIL-026, FR-BIL-027, FR-BIL-034..036.

### UC-BIL-02 Record payment for service lines and gate service start

- **Normal path:**
  1. The cashier selects S. The UI lists the lines with eligibility. The cashier keeps or edits the pre-selected unpaid lines.
  2. The payment is recorded (FR-BIL-011). Fully allocated lines become `ELIGIBLE`.
  3. The departments' worklists (sample collection, radiology) show eligible lines as ready, on their next refresh.
- **Gate (StartService):**
  1. When the lab technologist collects a sample (C05) or another department starts a service, the department's command calls `assertEligible(lineId)` inside its transaction.
  2. If not eligible, the response is `PAYMENT_NOT_ELIGIBLE`, with what is missing ("CBC: 300.00 due on Service invoice S-…").
- **Requirements:** FR-BIL-003, FR-BIL-009, FR-BIL-012, FR-ORD-005.

### UC-BIL-03 Post a charge from another module

- **Actor:** system caller (OT, lab, pharmacy, IPD) on behalf of a recorded user.
- **Normal path:**
  1. The caller sends `PostCharge` with a unique `sourceRef`.
  2. Billing resolves the target invoice: S for an OPD visit, D for a consultation fee, or `IPD_RUNNING` for an admission.
  3. Billing prices the charge and creates the charge and invoice line.
- **Recovery:** R1: retry with the same `sourceRef` → the existing charge is returned (FR-BIL-006). R2: a different module posts the same `sourceRef` with different content → `IDEMPOTENCY_KEY_REUSED` and an alert (data error).
- **Requirements:** FR-BIL-006, FR-BIL-033.

### UC-BIL-04 Open and close a cashier session

- **Normal path:**
  1. Open: the cashier opens a session (one open session per cashier per facility).
  2. Close: the cashier enters counted cash and card/mobile totals.
  3. The server computes expected amounts from payments recorded in the session, per method.
  4. The server records the variance and sets the session to `CLOSED_PENDING_REVIEW`.
  5. A finance user reviews the session and sets it to `REVIEWED`, with a note.
- **State machine:** `OPEN → CLOSED_PENDING_REVIEW → REVIEWED`.
- **Denied paths:**
  - D1: a second open session for the same cashier → `INVALID_TRANSITION`.
  - D2: the cashier reviews their own variance → `SEGREGATION_OF_DUTY`.
- **Requirements:** FR-BIL-026, FR-REP-002.

### UC-BIL-05 Correct a payment method

- **Normal path:**
  1. The supervisor selects the payment and the new method.
  2. The supervisor enters a reason (mandatory).
  3. The server creates the correction record and audits it.
  4. Reports show the corrected method with a marker.
- **Denied paths:** D1: the cashier corrects their own payment without supervisor permission → SP-04.
- **Open:** effect on closed sessions (Q-068).
- **Requirements:** FR-BIL-025.

### UC-BIL-06 IPD interim payment and final bill (CONFIRMED capability; settlement OPEN)

- **Interim payment:** the cashier selects the admission's running account and records the payment. Allocation for IPD is to the running account as a whole (PROPOSED; IPD service-level eligibility not required unless Q-015 or a deposit rule says otherwise). The balance updates.
- **Final bill:**
  1. Billing staff choose "Issue final bill".
  2. The server checks that no pending charges are queued for this admission (outbox drained or acknowledged).
  3. It freezes the account and produces the final bill version.
- **Settlement:** recording payments until the balance is 0 sets `SETTLED` and allows financial clearance. Financial clearance with a balance outstanding is **not available** until Q-006. The patient's physical departure can still be recorded by IPD. It is flagged `DEPARTED_WITH_DUES` ([C06 FR-IPD-013](C06-ipd-beds-discharge.md)), and the account stays unsettled for finance follow-up.
- **Requirements:** FR-BIL-028, FR-BIL-029, FR-IPD-012.

## 6. State machines

| Record | States |
| --- | --- |
| Invoice (`DOCTOR_FEE`, `SERVICE`) | `ISSUED → PARTIALLY_PAID → PAID`; `ISSUED → CANCELLED`; `PAID → PARTIALLY_PAID` when a new line is added (SERVICE only) |
| Invoice (`IPD_RUNNING`) | `OPEN → FINAL_ISSUED → SETTLED`; settlement with dues OPEN |
| Invoice line | `ACTIVE → CANCELLED` (no allocation); `REVERSED` (OPEN) |
| Line eligibility (derived) | `NOT_ELIGIBLE ↔ ELIGIBLE` |
| Payment (manual) | `RECORDED` (immutable). Gateway states OPEN. |
| Cashier session | `OPEN → CLOSED_PENDING_REVIEW → REVIEWED` |

## 7. Fixed rules versus configurable policy

| Fixed (product) | Configurable (tenant) |
| --- | --- |
| D and S separate; independent balances (FPR-03) | Price lists and doctor fees (CP-05) |
| Server-side pricing and eligibility | Eligibility rule per service (CP-02) |
| Exact decimals; no float (FPR-11) | Deposit rules (CP-03, disabled) |
| Unique source reference per charge (FPR-09) | Rounding (CP-07, disabled) |
| No edit or delete of posted money (FPR-06) | Discount and refund rules (CP-06, CP-08, disabled) |
| Method retained (FPR-04) | Numbering patterns (CP-09) |
| Idempotent payment (FPR-08) | Segregation pairs (CP-24) |

## 8. Acceptance examples

All amounts are synthetic and in BDT.

```gherkin
Scenario: Paying the doctor invoice leaves the service invoice owing (FR-BIL-001)
  Given visit V has doctor-fee invoice D = 500.00
  And service invoice S with lines CBC 300.00 and Chest X-ray 700.00
  When the cashier records CASH 500.00 allocated to D
  Then D.balance = 0.00 and D.status = PAID
  And S.balance = 1,000.00 and S.status = ISSUED

Scenario: Per-line eligibility under full-payment policy (FR-BIL-003, FR-BIL-012)
  Given policy CP-02 = FULL_PAYMENT for all lab and imaging services
  When the cashier records CARD 300.00 on S allocated to the CBC line
  Then CBC is ELIGIBLE and Chest X-ray is NOT_ELIGIBLE
  And S.status = PARTIALLY_PAID with balance 700.00
  And starting the X-ray returns PAYMENT_NOT_ELIGIBLE

Scenario: Duplicate submission (FR-BIL-011, FPR-08)
  When the cashier submits payment key "pay-91" for 500.00 on D twice
  Then one payment and one receipt exist
  And the second response is marked as a replay of the first

Scenario: Same key, different amount (SP-02)
  Given payment key "pay-91" was used for 500.00
  When a request with key "pay-91" and amount 400.00 arrives
  Then the response is IDEMPOTENCY_KEY_REUSED and nothing changes

Scenario: Two cashiers race for the same line (FR-BIL-034)
  Given the X-ray line has 700.00 unpaid
  When cashier A and cashier B each submit 700.00 for it at the same moment
  Then exactly one payment is recorded
  And the other receives AMOUNT_EXCEEDS_BALANCE

Scenario: Method is kept in reports (FR-BIL-004)
  Given a payment of 300.00 recorded as MOBILE with provider label "bKash"
  When the daily collection report is produced
  Then the payment appears under MOBILE (bKash) and not under CASH

Scenario: Retried charge posting creates one line (FR-BIL-006)
  Given OT posts charge sourceRef (tenant, OT, procedure, P-77, COMPLETED)
  When the same posting is delivered again by the worker
  Then the running account has one line for P-77

Scenario: Deposit rule not configured (FR-BIL-003 interim)
  Given no deposit policy is published
  When a cashier tries to mark a 300.00 partial payment as a deposit qualifying the X-ray
  Then the option is not offered and the server returns FEATURE_NOT_AVAILABLE if called

Scenario: Final bill counts deposits once (FR-BIL-029)
  Given admission A has charges totalling 12,500.00
  And interim payments 5,000.00 and 3,000.00
  When the final bill is issued
  Then it shows total 12,500.00, payments 8,000.00 and balance due 4,500.00
  And each payment appears exactly once
```

## 9. Traceability

| Requirement | Decision / source | Command | Data | Permission | Tests |
| --- | --- | --- | --- | --- | --- |
| FR-BIL-001 | C-008 | `IssueVisitInvoices`, `PostCharge` | `invoice(type)` | `billing.invoice.issue` | AT-BIL-001, AT-BIL-002 |
| FR-BIL-002 | C-009 | `RecordPayment` | `payment` | `billing.payment.record` | AT-BIL-003 |
| FR-BIL-003, -012 | C-011, P-020 | `RecordPayment`, `AssertEligible` | `payment_allocation`, `invoice_line.eligibility` | — | AT-BIL-004..007 |
| FR-BIL-004 | C-010 | `RecordPayment` | `payment.method` | — | AT-BIL-008, AT-REP-002 |
| FR-BIL-006, -033 | SRC-B06 | `PostCharge` | `charge.source_ref` unique | system | AT-BIL-009, AT-BIL-010 |
| FR-BIL-011, -034, -036 | C-029 | `RecordPayment`, `GetOperationStatus` | `idempotency_record` | `billing.payment.record` | AT-BIL-011..014 |
| FR-BIL-025 | SRC-B04 | `CorrectPaymentMethod` | `payment_method_correction` | `billing.payment.method_correct` | AT-BIL-015 |
| FR-BIL-026 | SRC-B07 | `OpenCashierSession`, `CloseCashierSession`, `ReviewCashierSession` | `cashier_session` | `billing.cashier_session.*` | AT-BIL-016, AT-BIL-017, UAT-CSH-010 |
| FR-BIL-027 | C-008 | `PrintReceipt` | `receipt`, `print_event` | `billing.payment.record` | AT-BIL-018, UAT-PRN-002 |
| FR-BIL-028, -029 | C-017 | `RecordPayment(account)`, `IssueFinalBill` | `invoice(IPD_RUNNING)` | `billing.*` | AT-BIL-019, AT-BIL-020 |
| FR-BIL-030, -031 | SRC-B03, SRC-B05 | totals query | `invoice_line.category` | — | AT-BIL-021, AT-BIL-022 |

## 10. Gaps and open questions

These are each **disabled** until answered:
- Q-004 deposits and allocation
- Q-005 emergency exceptions
- Q-006 discharge with dues
- Q-019 discounts
- Q-020 rounding
- Q-021 refunds
- Q-022 overpayment
- Q-023 restoration
- Q-024 cross-invoice payment
- Q-038 doctor fee rules
- Q-039 issue vs collect
- Q-040 deposit accounts
- Q-045 gateways
- Q-061 packages
- **Q-068** Which session or day reflects a payment-method correction made after the original cashier session closed?
