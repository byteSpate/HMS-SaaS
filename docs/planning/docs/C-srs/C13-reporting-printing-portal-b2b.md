# C13 — Reporting, printing, patient portal, B2B and referrals

| Control | Value |
| --- | --- |
| Module | `mod-reporting` (read models, report jobs, exports), `platform-print` (templates, rendering, print events), `mod-portal` (later), `mod-b2b` (later) |
| Version | 0.4.0-draft |
| Status | Reporting and printing SOURCE-DERIVED and CONFIRMED (C-025 bilingual prints). Portal, B2B and referrals are **GAP** (Q-031..Q-033). |
| Domain reviewer | Finance (collection reports), lab manager (lab reports), pilot IT (printers) |
| Sources | SRC-Q01, SRC-B05, SRC-B07, SRC-L10, SRC-L11, SRC-C01, SRC-N12; C-025 |

## 1. Purpose and scope

Produce authorized, reconciled reports and correct printed documents on real hospital printers, in Bangla and English. Later: give verified patients and B2B clients access to released results.

## 2. Requirements — reporting

| ID | Requirement | Status | Verify | Source |
| --- | --- | --- | --- | --- |
| FR-REP-001 | Reports shall be computed from authoritative posted records, with the same filters producing the same totals in summary and detail. A4/A5 print layouts are configurable. | SOURCE-DERIVED (v0.3) | T | SRC-Q01, SRC-B05 |
| FR-REP-002 | Daily collection report:<br>• payments by cashier, session, method (and provider label), invoice type (doctor fee / service / IPD)<br>• method corrections (FR-BIL-025) shown separately<br>• totals reconcile with cashier session close | SOURCE-DERIVED | T, U | SRC-B07, SRC-B04 |
| FR-REP-003 | An invoice register (by date and type) and patient bill/payment history shall reconcile with the collection report for the same period. | SOURCE-DERIVED | T | SRC-B05, SRC-B07 |
| FR-REP-004 | Every report requires a `report.view.<area>` permission and is tenant-scoped. Exporting to a file requires `report.export` and is audited (FR-AUD-003). Exported files are stored with tenant-scoped, time-limited download links. | CONFIRMED (C-029) | T | v0.3 ACCESS_CONTROL |
| FR-REP-005 | Reports expected to exceed an interactive budget (configurable, e.g., > 31 days of detail or > 50,000 rows, PROPOSED) run as background jobs. The user gets a notification and a download when done. Interactive work is not slowed (NFR-PERF-003). | PROPOSED | T, A | SRC-B01, SRC-Q02 |
| FR-REP-006 | Report delivery with outstanding dues. | OPEN (Q-013); interim: allowed, dues shown | T | — |
| FR-REP-007 | Operational dashboard (management): today's registrations, visits by kind, collections by method, pending lab stages, bed status counts (when IPD enabled). Every number links to the list it summarizes. | PROPOSED | U | SRC-Q02 |
| FR-REP-008 | Lab consumption summary with working filters (FR-LAB-021). | SOURCE-DERIVED | T | SRC-L11 |
| FR-REP-009 | Report definitions shall state their data timestamp ("as of 14:05") when served from a read model or replica that may lag. | PROPOSED | T | — |

## 3. Requirements — printing

| ID | Requirement | Status | Verify | Source |
| --- | --- | --- | --- | --- |
| FR-PRN-001 | Printable documents shall use versioned templates per document type and paper size: A4, A5, labels. Covered documents: receipt, invoice, appointment slip, token, prescription, order slip, lab report, specimen label, bed/patient label, admission form, return slip, final bill. Preview shows exactly what prints (same template version and record version). | SOURCE-DERIVED | U | SRC-Q01 |
| FR-PRN-002 | Printing or previewing never changes business state (FPR-07). It creates a print event (document, record version, template version, user, time, copy number). | CONFIRMED | T | SRC-L12..L15 |
| FR-PRN-003 | Labels:<br>• specimen labels (FR-LAB-005)<br>• bed/patient labels<br>Each shows committed data (ward/room/bed as of print time) on the first attempt (SRC-N12). Sizes and printer models OPEN (Q-046). | SOURCE-DERIVED | U | SRC-N12, SRC-L10 |
| FR-PRN-004 | A reprint of a receipt, invoice or report shall be marked "Copy n" (bn/en) and audited for receipts and invoices. | PROPOSED | T | — |
| FR-PRN-005 | Templates shall support Bangla, English and bilingual layouts (C-025). They embed or self-host fonts with correct Bangla shaping (conjuncts, vowel signs). Field order is consistent across documents of the same type (SRC-Q01). | CONFIRMED (C-025) | U | C-025, SRC-Q01 |
| FR-PRN-006 | Documents that are delivered or archived (released lab reports, final bills, portal downloads) shall be rendered server-side to PDF from the same template and record version (P-014). The stored PDF is referenced by the delivery event. | PROPOSED | T | — |
| FR-PRN-007 | Tenant header/footer (logo, name bn/en, address, phone) is configurable per template version. | SOURCE-DERIVED | U | SRC-Q01 |

## 4. Requirements — portal, B2B, referrals (GAP)

| ID | Requirement | Status | Verify | Source |
| --- | --- | --- | --- | --- |
| FR-POR-001 | Patient/proxy portal accounts are linked to a patient only through a verified process. A phone number alone never proves ownership. | CONFIRMED principle; process OPEN (Q-033) | — | v0.3 REPORTING_PORTAL |
| FR-POR-002 | Online appointment booking through the portal (same capacity rules as FR-SCH-003). | SOURCE-DERIVED; OPEN scope | — | SRC-C01 |
| FR-POR-003 | Portal shows only released reports for linked patients. Delivery with dues follows Q-013. | SOURCE-DERIVED; OPEN | — | SRC-C01 |
| FR-B2B-001 | B2B clients:<br>• setup<br>• staged order checks<br>• report dispatch to the client<br>• client bill/payment history<br>B2B staff see only their client's orders. | SOURCE-DERIVED; policies OPEN (Q-032) | — | SRC-C01, SRC-L17 |
| FR-REF-001 | Referral, working-share and MPO configuration and calculation. | OPEN (Q-031). **Not to be implemented from source formulas.** | — | SRC-C01 |

## 5. Acceptance examples

```gherkin
Scenario: Summary equals detail (FR-REP-001, FR-REP-003)
  Given on 2026-11-02 cashier C1 recorded payments 500.00 CASH, 300.00 CARD, 700.00 MOBILE (bKash)
  When the daily collection summary and the detailed payment list are produced for C1
  Then the summary shows CASH 500.00, CARD 300.00, MOBILE 700.00, total 1,500.00
  And the sum of the detailed list equals 1,500.00
  And C1's closed session expected amounts are identical

Scenario: Export is permission-gated and audited (FR-REP-004)
  Given finance user f1 has report.view.billing and report.export
  When f1 exports the collection report to a spreadsheet file
  Then the file contains only tenant Alpha's data
  And an audit event report.exported records f1, report, filters and time

Scenario: Bilingual receipt prints correctly (FR-PRN-005)
  Given tenant Alpha configures receipts as bilingual
  When the cashier prints receipt RCPT-2026-000045
  Then Bangla text renders with correct conjuncts and English text appears beside it
  And the amounts and receipt number match the payment record
```

## 6. Traceability

| Requirement | Command / query | Data | Permission | Tests |
| --- | --- | --- | --- | --- |
| FR-REP-001..003 | `GetCollectionReport`, `GetInvoiceRegister` | read models | `report.view.billing` | AT-REP-001..004, UAT-CSH-010 |
| FR-REP-004 | `ExportReport` | `report_export`, object storage | `report.export` | AT-REP-005, AT-ISO-008 |
| FR-REP-005 | `RequestReportJob` | `report_job` | `report.view.*` | AT-REP-006, AT-JOB-003 |
| FR-PRN-001..007 | `RenderDocument`, `RecordPrintEvent` | `print_template_version`, `print_event` | per document | AT-PRN-001..004, UAT-PRN-001..008 |

## 7. Gaps

- Q-013 (delivery with dues)
- Q-031..Q-033 (referrals, B2B, portal)
- Q-046 (printers and labels)
- Q-050 (digits and dates on prints)
- Report catalogue beyond the first release: to be compiled from the S1 report inventory with the pilot. Not all legacy reports are reproduced automatically.
