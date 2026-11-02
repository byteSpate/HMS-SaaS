# I — Manual test and UAT plan

| Control | Value |
| --- | --- |
| Document | I Manual test and user acceptance test (UAT) plan |
| Version | 0.4.0-draft |
| Status | **PROPOSED.** Cases cover RP-A in full and RP-B as an outline. Pilot device details depend on Q-042/Q-046. |
| Owner role | QA lead (plan and coordination); department leads (execution and sign-off) |
| Updated | 2026-10-12 |
| Depends on | [B §12 acceptance criteria](B-business-requirements.md#12-business-acceptance-criteria), [C-srs](C-srs/C00-srs-overview.md), [F](F-ui-ux-design.md) |

## 1. Purpose

Automated tests prove the software does what the specification says. UAT proves that **real staff can do their real work** with it, on **real devices**, in **both languages**, including handoffs between departments and recovery from outages. UAT is the evidence for the business acceptance criteria (BAC-01..12) at gate RG-3.

## 2. Entry and exit criteria

**Entry (UAT may start):**
- The release-candidate build is deployed to the UAT environment, and the automated suites are green on that commit ([H §13](H-automated-test-plan.md#13-ci-execution-and-evidence)).
- Synthetic UAT data is seeded: two tenants, role users, price lists, test catalogue for the pilot's tests, beds (RP-B). **No real patient data** unless the owner approves de-identified data (AS-009).
- Pilot printers, label printers and scanners are installed at UAT workstations (Q-046). Browser versions are recorded.
- Testers are trained for 30–60 minutes on the tested screens. The downtime paper forms are available.
- Open Severity 1 defects from earlier rounds: none.

**Exit (UAT passed for a gate):**
- All **P1** cases passed. At least 95% of P2 cases passed, with every failing P2 case covered by an accepted workaround (PROPOSED thresholds).
- No open Severity 1 or 2 defects (§9).
- Each department lead has signed the sign-off sheet (§9.4).
- Printer and device matrix completed for every pilot workstation type.

## 3. Test case format

Each case records:
- **ID**
- **Priority** (P1 must-pass / P2 / P3)
- **Role** (who executes)
- **Requirement IDs**
- **Setup** (data and state)
- **Steps**
- **Expected result**
- **Evidence** (screenshot, printed sample photo, receipt number, audit search result)
- **Result** (Pass / Fail / Blocked), **Defect ID**, **Tester**, **Date**

Amounts are synthetic BDT. Names are synthetic.

## 4. Department scenarios

### 4.1 Reception / front desk

| ID | P | Role | Req. | Setup | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-REC-001 | P1 | Receptionist | FR-PAT-001, -003 | Patient "Karim Ahmed", phone 01700000001 | Search "01700-000001", then "+880 1700 000001", then in Bangla digits | Same patient each time; found within a few keystrokes | Screenshots |
| UAT-REC-002 | P1 | Receptionist | FR-PAT-001, -011 | "Rahim Uddin" exists | Start registering "Rahim Udin" with the same phone | Duplicate candidate shown with reason "same phone"; staff can pick the existing patient | Screenshot |
| UAT-REC-003 | P1 | Receptionist | FR-PAT-002, -005, -006 | — | Register a new patient with Bangla name only, age only, no NID | Saved; MRN shown; banner shows the Bangla name; no fake birth date | Screenshot + MRN |
| UAT-REC-004 | P2 | Receptionist | FR-PAT-001 | — | Search by Bangla name fragment, then by MRN | Correct results | Screenshot |
| UAT-REC-005 | P1 | Receptionist | FR-SCH-002, -003 | Session with 2 slots | Book two patients; try a third | Third booking refused with a clear "session full" message and next sessions suggested | Screenshot |
| UAT-REC-006 | P1 | Receptionist | FR-VIS-002, FR-BIL-010 | Booked appointment today | Check in | Serial number shown; doctor-fee invoice with amount; token printed | Token photo |
| UAT-REC-007 | P1 | Receptionist | FR-VIS-001, FR-ORD-001 | CBC directly orderable, Thyroid not | Create a diagnostic visit with CBC; try to add Thyroid | CBC added, service invoice line created; Thyroid not offered / refused | Screenshot |
| UAT-REC-008 | P2 | Receptionist | FR-SCH-002, FR-SCH-006 | — | Reschedule an appointment; book a "next visit" from a visit | Old marked rescheduled; new booking linked; slip prints "Next visit" date | Slip photo |

### 4.2 Cashier

| ID | P | Role | Req. | Setup | Steps | Expected | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UAT-CSH-001 | P1 | Cashier | FR-BIL-026 | — | Open a cashier session with a cash float | Session open; payments allowed | Screenshot |
| UAT-CSH-002 | P1 | Cashier | FR-BIL-001 | Visit with D = 500.00, S = 300.00 + 700.00 | Pay D in cash | D paid; S still shows 1,000.00 due; receipt says "Doctor fee" | Receipt photo |
| UAT-CSH-003 | P1 | Cashier | FR-BIL-012 | Same visit | Pay only CBC (300.00) by card | CBC "Ready", X-ray "Payment required"; receipt lists CBC only | Receipt photo |
| UAT-CSH-004 | P1 | Lab tech + cashier | FR-BIL-003 | After UAT-CSH-003 | Lab tries to collect the X-ray sample (or radiology tries to start) | Refused with amount due; succeeds after the cashier collects 700.00 | Screenshots |
| UAT-CSH-005 | P1 | Cashier | FR-BIL-004 | — | Pay by Mobile with provider "bKash" and reference | Receipt and report show Mobile (bKash) and the reference | Receipt + report |
| UAT-CSH-006 | P1 | Cashier | FR-BIL-036 | Tester's network is cut by the facilitator right after clicking Confirm | Observe the UI; restore the network | UI shows "Checking…" and then "Saved", or "Not saved — nothing charged". No duplicate payment in the session list. | Screen recording |
| UAT-CSH-007 | P1 | Cashier | FR-BIL-027 | Paid receipt; printer jammed | Clear the jam; reprint | "Copy 2" printed; still one payment | Photos |
| UAT-CSH-008 | P2 | Cashier | FR-BIL-019 | — | Enter an amount larger than the balance | Prevented with explanation | Screenshot |
| UAT-CSH-009 | P2 | Billing supervisor | FR-BIL-025 | Payment wrongly recorded as Cash | Correct it to Card with a reason | Original kept; correction visible with marker; cashier cannot do it alone | Screenshot |
| UAT-CSH-010 | P1 | Cashier + finance | FR-BIL-026, FR-REP-002 | A day of mixed payments (scripted list of 20 synthetic transactions) | Close the session with counted amounts; finance reviews; run the daily collection report | Expected = sum of receipts by method; variance (if any) recorded; report totals equal the session totals and the receipt sum (BAC-04) | Session close sheet + report printout |

### 4.3 Doctor (RP-A)

| ID | P | Role | Req. | Steps | Expected |
| --- | --- | --- | --- | --- | --- |
| UAT-DOC-001 | P1 | Doctor | FR-CLI-002 | Open the worklist with one paid and one unpaid patient | Unpaid shows "Waiting for payment" and cannot be opened; paid can |
| UAT-DOC-002 | P1 | Doctor | FR-CLI-003..006, FR-ORD-002 | Write a note, order CBC + X-ray, prescribe two medicines (one hospital, one outside), sign, print | Prescription prints correctly in the chosen language; orders appear on the service invoice as unpaid |
| UAT-DOC-003 | P2 | Doctor | FR-CLI-003 | Amend the signed note | New version with reason; history visible |
| UAT-DOC-004 | P2 | Doctor | FR-CLI-009 | Book the next visit from the consultation | Appointment created; shown on the prescription |

### 4.4 Laboratory

| ID | P | Role | Req. | Steps | Expected |
| --- | --- | --- | --- | --- | --- |
| UAT-LAB-001 | P1 | Lab tech | FR-LAB-004 | Open the collection worklist | Only paid tests listed; unpaid in the "awaiting payment" list with amount |
| UAT-LAB-002 | P1 | Lab tech | FR-LAB-005 | Collect CBC + LFT; print labels | Labels print at the correct size; barcode scans back to the right specimen; text legible |
| UAT-LAB-003 | P1 | Lab tech | FR-LAB-005 | Scan the printed label at the bench with the pilot scanner | Correct specimen opens |
| UAT-LAB-004 | P1 | Lab tech | FR-LAB-006 | Receive a specimen | Status received with time and user |
| UAT-LAB-005 | P1 | Lab tech | FR-LAB-006 | Reject a specimen as "Haemolysed" | Recollection request appears, linked; original retained (BAC-06) |
| UAT-LAB-006 | P1 | Lab tech | FR-LAB-008, -018, -019 | Enter results incl. comments with "RBCs" | Flags correct; abbreviations accepted; sequence as configured |
| UAT-LAB-007 | P1 | Lab authority | FR-LAB-009, -010 | Verify and release (different users if CP-13) | Released; doctor sees it; same-user release blocked when configured |
| UAT-LAB-008 | P1 | Lab authority | FR-LAB-002 | Open a released report, print, press Back, reopen | Still Released (BAC-05) |
| UAT-LAB-009 | P1 | Lab authority | FR-LAB-002 | Open print/customize options and cancel | Still Released |
| UAT-LAB-010 | P1 | Lab tech | FR-LAB-002 | Process a pending report to verified; reload | Status persisted |
| UAT-LAB-011 | P1 | Lab authority | FR-LAB-012 | Amend a released value with a reason | "Amended" report printed; old version viewable |
| UAT-LAB-012 | P1 | Delivery desk | FR-LAB-022, -014, -020 | Print and hand over the report; mark delivered | A4 layout approved by the pathologist (PBF template if in scope); IPD bed shown; delivery recorded |

### 4.5 Inpatient and nursing (RP-B outline)

| ID | P | Role | Req. | Steps | Expected |
| --- | --- | --- | --- | --- | --- |
| UAT-IPD-001 | P1 | Admission desk | FR-IPD-001 | Admit from an OPD visit when the ward is full | Admission "Awaiting bed" with source visit |
| UAT-IPD-002 | P1 | Two nurses | FR-IPD-007 | Both allocate the last bed at the same moment (facilitator counts down) | One succeeds; the other sees "bed no longer available" |
| UAT-IPD-003 | P1 | Ward in-charge | FR-IPD-002 | Transfer a patient | History shows both beds and times; MRN unchanged; new bed label prints first time |
| UAT-IPD-004 | P1 | Admission desk | FR-IPD-003 | Try to allocate a bed vacated by discharge | Refused until "cleaning complete" is recorded |
| UAT-IPD-005 | P1 | Cashier | FR-BIL-028 | Record two interim deposits | Running bill shows both; balance correct |
| UAT-IPD-006 | P1 | Doctor | FR-IPD-011 | Medical discharge | Status visible on the ward list; routine orders blocked |
| UAT-IPD-007 | P1 | Billing | FR-BIL-029, FR-IPD-012 | Issue the final bill; settle; clear | Each payment once; cleared only at 0 balance (BAC-10) |
| UAT-IPD-008 | P1 | Nurse | FR-IPD-013 | Record departure for a patient with dues (scenario) | Acknowledgment required; flag shown; bed needs cleaning |
| UAT-NUR-001 | P1 | Nurse | FR-NUR-001, -011 | Open the ward list | Active, Daycare and discharged patients clearly labeled; released reports open |
| UAT-NUR-002 | P1 | Nurse | FR-NUR-004 | Create a 3-line indent; edit one quantity | Other lines intact |
| UAT-NUR-003 | P1 | Nurse + pharmacist | FR-NUR-005 | Return 2 medicines; pharmacy partly accepts | Both sides see the same slip number and decisions |
| UAT-NUR-004 | P2 | Nurse | FR-NUR-006 | Return after discharge | Recorded and routed to supervisor; no silent credit |
| UAT-PHA-001 | P1 | Pharmacist | FR-PHA-002, -005 | Dispense an indent; try an expired batch | Movements and charges once; expired blocked |
| UAT-PHA-002 | P1 | Pharmacist | FR-PHA-007 | Accept a return over the issued quantity | Prevented |

### 4.6 Administration and security

| ID | P | Role | Req. | Steps | Expected |
| --- | --- | --- | --- | --- | --- |
| UAT-ADM-001 | P1 | Hospital admin | FR-ACC-008 | Create a user, assign the Cashier role, scope to the facility | User can log in and take payments, not discounts |
| UAT-ADM-002 | P1 | Hospital admin | FR-ACC-010 | Revoke a logged-in user | Their next action is refused |
| UAT-ADM-003 | P1 | Hospital admin | FR-CFG-002 | Publish a new price list effective tomorrow 00:00 | Today's invoices use the old prices; tomorrow's use the new |
| UAT-ADM-004 | P1 | Hospital admin | FR-AUD-001, -005 | Search the audit for today's payments and the lab release | Who/when/what/version shown (BAC-11) |
| UAT-ADM-005 | P2 | Hospital admin | FR-SUP-001 | Approve then revoke a vendor support grant | Access appears in the audit; ends on revoke |
| UAT-ADM-006 | P1 | Facilitator with two tenants | NFR-ISO-001 | Log in as a Beta Clinic user and try URLs copied from the Alpha Hospital session | "Not found" everywhere; no Alpha data (BAC-08) |

## 5. Printing, labels, scanners and real devices

**Device matrix (complete one row per workstation type at the pilot):**

| Workstation | OS / browser (version) | Printer model / driver | Paper / label size | Scanner model | Tested cases |
| --- | --- | --- | --- | --- | --- |
| Reception desk | | | A5 / token | | UAT-PRN-001, -003 |
| Cashier desk | | | A5 or 80 mm roll | | UAT-PRN-002 |
| Doctor room | | | A5 | — | UAT-PRN-005 |
| Lab collection | | Label printer | e.g., 50 × 25 mm (Q-046) | | UAT-PRN-006, UAT-LAB-002/003 |
| Lab reporting / delivery | | | A4 | | UAT-PRN-004 |
| Nurse station (RP-B) | | | Label / A6 | | UAT-PRN-007 |
| Pharmacy (RP-B) | | | A5 | | UAT-PRN-008 |

| ID | P | Document | Checks |
| --- | --- | --- | --- |
| UAT-PRN-001 | P1 | Token / appointment slip | Fits the paper; serial number large; Bangla shaping correct; no browser header/footer text |
| UAT-PRN-002 | P1 | Receipt (Doctor fee and Services) | Invoice type visible; amounts and balance correct; method shown; "Copy n" on reprint; bilingual layout readable |
| UAT-PRN-003 | P2 | Service invoice | Category subtotals; per-line status; expected report times |
| UAT-PRN-004 | P1 | Lab report A4 | Pathologist-approved layout; units/ranges; flags; signatures/names; "Amended" banner; page numbering; ward/bed for IPD |
| UAT-PRN-005 | P1 | Prescription A5 | Doctor header; medicines readable in both languages; next visit; signature line |
| UAT-PRN-006 | P1 | Specimen label | Prints first time; barcode scans reliably with the pilot scanner at the bench; no clipping; text legible on tubes |
| UAT-PRN-007 | P1 (RP-B) | Bed/patient label | Prints first time after transfer (SRC-N12); correct bed |
| UAT-PRN-008 | P2 (RP-B) | Return slip / issue slip | Numbers match the system; both teams can file it |

**Browser print settings:** record the required settings (margins "None", headers/footers off, scale 100%) per workstation in the deployment checklist. Where a printer cannot be driven reliably from the browser, raise a defect against ADR-010 (direct-print option OPEN).

## 6. Keyboard, accessibility and bilingual checks

| ID | P | Role | Steps | Expected |
| --- | --- | --- | --- | --- |
| UAT-ACC-001 | P1 | Receptionist | Complete UAT-REC-001 → UAT-REC-006 without a mouse | Possible; focus always visible; shortcuts discoverable (`?`) |
| UAT-ACC-002 | P1 | Cashier | Complete UAT-CSH-002/003 without a mouse | Possible |
| UAT-ACC-003 | P2 | Lab tech | Enter results using only Tab/Enter/F2 | Possible |
| UAT-ACC-004 | P2 | Any | Zoom the browser to 200%; use a screen reader on the login and front desk screens | Usable; labels announced |
| UAT-I18N-001 | P1 | All roles | Switch language on every tested screen | All labels translated; no truncation that hides meaning |
| UAT-I18N-002 | P1 | Receptionist | Switch language mid-registration | Input kept |
| UAT-I18N-003 | P1 | Native reviewer | Review glossary terms on screens and prints (A1) | Terminology approved or corrections logged |
| UAT-I18N-004 | P1 | Cashier | Print bilingual receipts | Both scripts correct; numbers formatted as configured (Q-050) |
| UAT-I18N-005 | P2 | Receptionist | Enter and search names typed with different Bangla keyboards/IMEs | Found consistently |
| UAT-I18N-006 | P2 | Lab authority | Print a report in English and in bilingual mode | Approved layouts |

## 7. End-to-end staff handoffs

| ID | P | Roles | Journey | Expected |
| --- | --- | --- | --- | --- |
| UAT-E2E-001 | P1 | Reception → cashier → doctor → cashier → lab tech → lab authority → delivery desk | BW-01 complete OPD journey (B §8) with synthetic patient "Salma Begum" | Every handoff shows the right state without phone calls. Two receipts. The released report is delivered. The audit shows each actor. |
| UAT-E2E-002 | P1 | Reception → cashier → lab | BW-02 diagnostic-only journey | No doctor invoice; lab gate respects payment |
| UAT-E2E-003 | P1 (RP-B) | Doctor → admission → nurse → pharmacy → cashier → nurse → housekeeping | BW-05 admission to cleaning | Bed board, running bill and final bill consistent throughout |
| UAT-E2E-004 | P2 | Two cashiers and a supervisor | Peak-hour drill: 30 synthetic patients in 20 minutes at two desks | No duplicate payments; reconciliation at close; staff observations recorded (SM-04 baseline comparison) |

## 8. Downtime and recovery exercises

Run on the UAT/staging environment with the DevOps lead. Paper forms come from the downtime kit ([J RB-03](J-vps-deployment-operations.md#12-runbooks)).

| ID | P | Exercise | Expected outcome |
| --- | --- | --- | --- |
| UAT-DT-001 | P1 | **Internet loss at a workstation** for 15 minutes during cashier work | UI shows the offline banner; nothing claims "saved"; staff switch to paper receipts; after reconnection, staff enter the paper transactions; reconciliation finds no duplicates |
| UAT-DT-002 | P1 | **Application outage** (API stopped) for 30 minutes | Maintenance page; paper procedure; recovery checklist executed; back-entry tagged "entered after downtime" (PROPOSED field) |
| UAT-DT-003 | P1 | **Restore drill** (RB-07): restore staging from backup to a point in time; staff continue the workflow | Restored data consistent; invoices/payments reconcile; files (PDFs) available; time measured against RTO (Q-043) |
| UAT-DT-004 | P2 | **Printer failure** mid-shift | Reprint from records works; no duplicate business records |
| UAT-DT-005 | P2 | **Worker/queue outage** (worker stopped 20 minutes) | Core desk work continues; PDFs and notifications catch up after restart; no lost events (outbox lag drains) |

## 9. Defects, retesting and acceptance responsibilities

### 9.1 Severity

| Severity | Definition (hospital-specific) | Examples | Release impact |
| --- | --- | --- | --- |
| **S1 Critical** | Wrong patient, wrong money, data exposure, data loss, or a core workflow impossible with no workaround | Payment applied to the wrong invoice; another tenant's patient visible; a released result changes value | Blocks the gate; fix + full regression |
| **S2 Major** | Core workflow possible only with an unsafe or burdensome workaround; incorrect printed clinical/financial document | Receipt omits the invoice type; label barcode unreadable; report flags wrong | Blocks the gate |
| **S3 Minor** | Non-core function wrong, or a core function with a safe, reasonable workaround | Filter chip not persisted; slow export | Fix planned; owner may accept for the gate |
| **S4 Cosmetic** | Text, alignment, translation polish without meaning change | Spacing in the bilingual header | Backlog |

A translation that **changes meaning** in a clinical or financial context is S2.

### 9.2 Defect record

ID · title · severity · case ID · requirement · environment/build · steps · expected vs actual · evidence · tester · date · status.

Defects referencing an OPEN question are triaged by the product owner. They may become a decision rather than a fix.

### 9.3 Retesting

- A fix requires re-running the failed case, plus the related cases in the same section.
- The automated regression for the bug is added (H), where feasible.
- An S1/S2 fix triggers a re-run of all P1 cases of the affected department and the E2E journeys.

### 9.4 Acceptance responsibilities and sign-off

| Area | Signs off | Evidence reviewed |
| --- | --- | --- |
| Front desk | Front desk lead | UAT-REC, UAT-ACC-001, UAT-I18N-001/002 |
| Cashier and collections | Finance lead | UAT-CSH, UAT-E2E-004, UAT-PRN-002 |
| Doctor workflow | Medical director / OPD lead | UAT-DOC, UAT-PRN-005 |
| Laboratory | Pathologist + lab manager | UAT-LAB, UAT-PRN-004/006 |
| Inpatient/nursing/pharmacy (RP-B) | IPD manager, nursing superintendent, chief pharmacist | UAT-IPD, UAT-NUR, UAT-PHA |
| Administration/security | Hospital administrator + product owner | UAT-ADM |
| Language | Native-speaker reviewer | UAT-I18N-003..006 |
| Operations | DevOps lead + product owner | UAT-DT |
| **Overall UAT acceptance (RG-3)** | **Product owner** with the pilot hospital's management | All of the above + open defect list |

The sign-off sheet records: name, role, date, cases reviewed, open defects accepted (with IDs and reasons), and conditions.
