# C12 — Finance, HR, attendance and payroll (explicit gap specification)

| Control | Value |
| --- | --- |
| Module | `mod-finance`, `mod-workforce` (future) |
| Version | 0.4.0-draft |
| Status | Breadth CONFIRMED (C-001). Detailed rules **largely OPEN**. This file deliberately specifies what is known and lists what is missing. It must not be read as a finance or payroll design. |
| Domain reviewer | Finance director; HR manager |
| Sources | SRC-B07, SRC-H01; v0.3 FINANCE_HR. Statutory topics DEFERRED (DEF-001). |

## 1. Why this is a gap

The supplied sources cover:
- for finance: daily transactions and finalization, bank reconciliation, transaction search, client bill/payment histories
- for HR: employee personal, job and department records, plus HR reports

They do **not** provide:
- a chart of accounts or posting rules
- receivables/payables processes or period close
- salary structures, allowances, deductions, overtime or leave rules
- attendance devices
- pay periods

Payroll and tax have statutory dimensions, which are deferred (DEF-001). Inventing any of these would violate the brief (rule 8).

## 2. What is specified now

| ID | Requirement | Status | Verify | Source |
| --- | --- | --- | --- | --- |
| FR-FIN-001 | Cashier session close, variance review and the daily collection report by cashier and method are specified in C04 (FR-BIL-026) and C13 (FR-REP-002). | SOURCE-DERIVED (see C04) | T | SRC-B07 |
| FR-FIN-002 | Bank reconciliation of non-cash payments (card, mobile, bank transfer) against statements. | OPEN (Q-029). **GAP.** | — | SRC-B07 |
| FR-FIN-003 | Finance users shall search transactions (payments, refunds when enabled, corrections) by date, method, cashier, patient, invoice and reference. They shall view a patient's or client's bill and payment history. | SOURCE-DERIVED | T | SRC-B07 |
| FR-FIN-004 | General ledger posting in-product, **or** export of billing summaries to an external accounting system. | OPEN (Q-029). **GAP.** | — | v0.3 FINANCE_HR |
| FR-FIN-005 | Period close and locking. | OPEN (Q-029). **GAP.** | — | v0.3 FINANCE_HR |
| FR-FIN-006 | Patient accounting (billing) remains separate from SaaS subscription revenue (DEF-006). | CONFIRMED | I | v0.3 FINANCIAL_RULES |
| FR-HR-001 | Employee master: personal details, job title, department, employment dates, contact; optional link to a user and a practitioner record. | SOURCE-DERIVED | T | SRC-H01 |
| FR-HR-002 | Employee data access (`hr.employee.view` / `.manage`) shall be separate from clinical privileges. An HR officer does not gain patient access, and a doctor does not gain HR access. | CONFIRMED principle (v0.3) | T | v0.3 FINANCE_HR |
| FR-HR-003 | Attendance capture (devices, manual entry, rosters). | OPEN (Q-030). **GAP.** | — | SRC-H01 |
| FR-HR-004 | Payroll calculation, payslips, deductions. | OPEN (Q-030) + statutory DEFERRED (DEF-001). **GAP.** | — | v0.3 |
| FR-HR-005 | Employee and HR reports (lists by department, joiners/leavers). | SOURCE-DERIVED | U | SRC-H01 |

`hr.employee.view` and `hr.employee.manage` are added to the [permission catalogue](C00-srs-overview.md#8-permission-catalogue-and-approval-responsibilities) when this module is scheduled.

## 3. Information needed before finance or payroll design

| Need | Example of an acceptable answer | Question |
| --- | --- | --- |
| Ledger scope | "Export daily summaries to our accounting software in CSV with these columns", or "Full GL with chart of accounts attached" | Q-029 |
| Worked posting examples | 3–5 synthetic transactions with the expected journal lines | Q-029 |
| Period close | Who closes, what locks, how corrections after close work | Q-029 |
| Pay structure | Components, formulas and rounding for 3 synthetic employees | Q-030 |
| Attendance | Device make/model or manual sheet format; shift rules | Q-030 |
| Statutory | Deferred until the owner opens DEF-001 | DEF-001 |

## 4. Acceptance examples (only for specified items)

```gherkin
Scenario: Payment method preserved in finance search (FR-FIN-003)
  Given a payment of 300.00 recorded as MOBILE (bKash)
  When finance searches payments for that day with method MOBILE
  Then the payment is listed with its receipt number and cashier

Scenario: HR and clinical access are separate (FR-HR-002)
  Given HR officer h1 has hr.employee.manage only
  When h1 opens a patient record
  Then PERMISSION_DENIED is returned
```
