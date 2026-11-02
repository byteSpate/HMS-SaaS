# F — UI/UX design guidance

| Control | Value |
| --- | --- |
| Document | F UI/UX design guidance (navigation, screens, flows, states, accessibility, localization, print layouts) |
| Version | 0.4.0-draft |
| Status | **PROPOSED.** Interaction rules that implement confirmed behavior are marked with their decision IDs. Layouts, shortcuts and Bangla wording need staff usability testing and native-speaker review (Q-050). Visual foundation (device tiers, fonts, color tokens, in-house components, reuse rules) is decided in [ADR-022](D2-adr/ADR-022-ui-foundation.md); where this document and ADR-022 differ, ADR-022 wins. |
| Owner role | UX lead + domain leads (front desk, cashier, lab, nursing) |
| Updated | 2026-10-15 |
| Depends on | [C-srs](C-srs/C00-srs-overview.md), [A1 Glossary](A1-glossary.md), ADR-002, ADR-010, ADR-015, ADR-017, ADR-022 |

## 1. Design principles for this hospital product

1. **Right patient, every time.** The patient banner is always visible in patient context. Actions carry the patient and visit they were started for, and the server re-checks them (R-01).
2. **Show committed truth.** A screen says "Saved" only after the server confirms. A timeout is shown as "Not sure yet — checking", never as failure or success (FPR-15, FR-BIL-036).
3. **Separate things look separate.** Doctor-fee invoice and service invoice are two cards with two balances. Medical discharge, financial clearance and departure are three steps (C-008, Q-006).
4. **Keyboard first at busy desks.** Reception, cashier, sample collection and result entry are fully keyboard-operable (SRC-B01, NFR-UX-001).
5. **Status is text plus color.** Every state badge has a word (bn/en) and an icon, not only a color (NFR-ACC-001).
6. **Bilingual without layout breakage.** Bangla strings are often longer and need more line height. Components are sized for both (C-025).
7. **Unavailable is explicit.** When a rule is not configured (OPEN questions), the UI says so plainly ("Refunds are not set up for this hospital"). It never shows a half-working control.

## 2. Role-based navigation and screen inventory

### 2.1 Navigation by role (default templates; actual menus follow permissions)

| Role | Home screen | Primary navigation |
| --- | --- | --- |
| Receptionist | **Front desk** (search + today's arrivals) | Front desk · Appointments · Visits · Direct diagnostics · Report delivery |
| Cashier | **Cashier desk** (search + queue of unpaid invoices) | Cashier desk · My session · Receipts (reprint) |
| Doctor | **My worklist** (today's sessions) | My worklist · Patient record · Results · Next visits · Admissions (request) |
| Nurse | **Ward list** | Ward list · Bed board (view) · Indents · Returns · Lab results |
| Lab technologist | **Lab worklists** (stage tabs) | Collection · Receive · Result entry · Dispatch · Recollections |
| Lab authority | **To verify / to release** | Verify · Release · Amend · Lab configuration |
| Pharmacy | **Pharmacy requests** | Requests · Dispense · Returns · Stock (view) |
| Billing supervisor | **Corrections queue** | Method corrections · Final bills · Sessions |
| Finance | **Collections** | Collection report · Sessions review · Transaction search · Exports |
| Hospital admin | **Administration** | Users & roles · Masters · Price lists · Policies · Print templates · Audit · Support grants |
| Management | **Dashboard** | Dashboard · Reports |

A top bar shows:
- hospital name
- facility
- language switch (বাংলা | English)
- user menu (change password, sign out)
- a "Last updated" indicator on worklists

### 2.2 Screen inventory

The release column refers to the proposed options ([B §9](B-business-requirements.md#9-proposed-release-boundaries)): A = RP-A, B = RP-B, C = RP-C, L = later.

| ID | Screen | Roles | Key requirements | Release |
| --- | --- | --- | --- | --- |
| SCR-01 | Login / choose hospital / MFA | All | FR-ACC-001..006 | A B C |
| SCR-02 | Front desk: search, register, duplicate review | RCP | FR-PAT-001..011 | A B C |
| SCR-03 | Patient record (demographics, history of visits, invoices, reports) | RCP, DOC, CSH | FR-PAT-008, FR-PAT-010 | A B C |
| SCR-04 | Appointments: schedule calendar, book, reschedule, cancel | RCP | FR-SCH-001..006 | A B |
| SCR-05 | Check-in / walk-in / diagnostic visit | RCP | FR-VIS-001..005, FR-ORD-001 | A B C |
| SCR-06 | Cashier desk: invoices side by side, pay, receipt | CSH | FR-BIL-001..012, -026, -027, -036 | A B C |
| SCR-07 | Cashier session open/close | CSH, FIN | FR-BIL-026 | A B C |
| SCR-08 | Doctor worklist | DOC | FR-CLI-002 | A B |
| SCR-09 | Consultation (note, orders, prescription, next visit) | DOC | FR-CLI-003..009, FR-ORD-002..008 | A B |
| SCR-10 | Lab: collection worklist and labelling | LBT | FR-LAB-004, -005 | A B C |
| SCR-11 | Lab: receive/reject/dispatch | LBT | FR-LAB-006, -007 | A B C |
| SCR-12 | Lab: result entry grid | LBT | FR-LAB-008, -018, -019 | A B C |
| SCR-13 | Lab: verify and release | LBA | FR-LAB-009..012 | A B C |
| SCR-14 | Report view, print and delivery desk | RCP, LBT, DOC | FR-LAB-002, -022 | A B C |
| SCR-15 | Bed board | NUR, RCP, DOC | FR-IPD-005..007 | B |
| SCR-16 | Admission desk and awaiting-bed list | RCP, DOC | FR-IPD-001 | B |
| SCR-17 | Ward list (nurse station) | NUR | FR-NUR-001, -011, -013 | B |
| SCR-18 | Indent (batch) and returns | NUR, PHA | FR-NUR-004..006, FR-PHA-007 | B |
| SCR-19 | Discharge steps panel | DOC, NUR, CSH | FR-IPD-010..013 | B |
| SCR-20 | Pharmacy dispense | PHA | FR-PHA-002..005 | B |
| SCR-21 | Collection report and session review | FIN | FR-REP-002, FR-BIL-026 | A B C |
| SCR-22 | Administration: users, roles, memberships | ADM | FR-ACC-008 | A B C |
| SCR-23 | Administration: masters, price list publish, policies | ADM | FR-CFG-001, -002 | A B C |
| SCR-24 | Audit search | ADM | FR-AUD-005 | A B C |
| SCR-25 | Support grant approvals | ADM | FR-SUP-001 | A B C |
| SCR-26 | Management dashboard | MGT | FR-REP-007 | A B C |
| SCR-27 | Print preview (shared) | All printing roles | FR-PRN-001..005 | A B C |

### 2.3 Device tiers and shell (ADR-022)

| Tier | Width | Shell | Notes |
| --- | --- | --- | --- |
| Phone | below 768 | Top bar with search, bottom tab bar (at most 5 items plus More) | 44 px targets; tables become stacked rows; payment, registration, result entry, verify/release, price publish and audit show "Use a tablet or computer" (C-054) |
| Tablet | 768 to 1279 | 72 px icon rail plus top bar | List and detail one pane at 768, split at 1024; 44 px targets |
| Desktop | 1280 and up | 240 px collapsible sidebar plus top bar | Keyboard-first; compact tables; content capped at 2xl |

Breakpoint logic lives only in layout components (ADR-022 section 9); screens do not write it.

## 3. Patient and visit context; safe context switching

**Patient banner (always visible in patient context; FR-PAT-010):**

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ রহিম উদ্দিন / Rahim Uddin   ♂ 45 y   MRN-000123   📞 01700-000001                          │
│ Visit: OPD · Dr. Hasan (Medicine) · Serial 12 · Arrived 10:42          [Temporary ID] (if any)│
│ Doctor fee: PAID ✓      Services: 700.00 due ●      Admission: —                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Rules:**
1. **One patient per browser tab.** No "current patient" is stored in shared browser storage, so two tabs never interfere. Each tab's URL carries the patient and visit IDs.
2. Switching patients in a tab with unsaved input opens a confirmation: "You have unsaved changes for Rahim Uddin. Discard / Stay" (bn/en).
3. Every command sends the **context IDs** (`patientId`, `visitId`) together with the target record. The server rejects a mismatch, e.g., an invoice line from a different visit (`VALIDATION_FAILED: CONTEXT_MISMATCH`). This catches stale tabs and copy-paste mistakes.
4. **Temporary identity** is shown with a yellow "Temporary ID" text badge on the banner and every print (FR-PAT-004).
5. **Name display:** both scripts when both exist; otherwise the one that exists. Never a machine transliteration.
6. **Duplicate review** shows candidates side by side with the matching reasons ("same phone", "similar name + same sex + age ±2"). The "Register as new" button stays visible but requires an explicit second confirmation when strong candidates exist.

## 4. Key department flows

### 4.1 Reception: returning patient to check-in (target: keyboard only)

1. `/` focuses search.
2. Type a phone, MRN or name.
3. Use ↓/↑ to pick and Enter to open.
4. The banner appears with today's appointment highlighted.
5. Press `Alt+Shift+C` (Check in) or click.
6. A confirmation panel shows the serial number and "Doctor fee invoice DF-… 500.00 due".
7. Optionally print the token slip (A5 or receipt-printer size).
8. Enter returns focus to search for the next patient.

### 4.2 Cashier: take payment for two invoices

See wireframe W-02 (§11). The cashier sees **two cards**. Paying the doctor fee does not touch the service card. After a payment, the outcome panel shows the receipt number, the new balances and a Print button. Focus moves to the next unpaid card ("Service invoice — 1,000.00 due").

### 4.3 Doctor: consultation

1. On the worklist, Enter opens the next `WAITING` patient. Patients with `WAITING_PAYMENT` are visible but greyed with the text "Waiting for payment" and cannot be opened for consultation.
2. Write the note, add orders (type-ahead, Enter adds) and the prescription, then sign.
3. **The orders panel shows each order's payment status** ("Not paid yet"), so the doctor can tell the patient to go to the cashier.

### 4.4 Nurse: ward list, indent, returns

- The ward list groups patients by room. Badges: `Active`, `Discharged — awaiting departure`, `Daycare`. A filter shows released lab reports since the last shift.
- **Indent:** a multi-line grid; Enter adds a line. Editing one quantity changes only that line (FR-NUR-004).
- **Return:** choose issued lines, enter quantities, submit, print the slip. A status column shows the pharmacy decision.

### 4.5 Laboratory

- **Collection:**
  1. Scan the patient barcode or search.
  2. Eligible tests appear grouped by tube.
  3. "Collect & print labels".
  4. Ineligible tests show "Payment required — 300.00 due".
- **Result entry:** a grid per section. Tab moves across result cells. Abnormal flags appear as you type. Save stores a version; the status changes only via "Submit for verification".
- **Verify/release:** a side-by-side list and detail view. "Verify" and "Release" are separate buttons (or one "Verify & release" when CP-13 allows). The amendment flow requires a reason and shows the old and new values.

### 4.6 Pharmacy (RP-B)

A request list (prescription requests, ward indents) → dispense screen with batch selector (expired batches disabled with the reason) → issue slip. Returns screen with accepted quantity per line.

### 4.7 Administration

Price list publish is a **three-step wizard**:
1. edit draft
2. review the differences (old → new price, new and removed items)
3. choose the effective time and publish

Policies follow the same pattern. Every publish needs a confirmation that names the effective time in the facility timezone.

## 5. Billing presentation rules

| Rule | UI behavior | Basis |
| --- | --- | --- |
| Separate invoices | Two cards titled **"Doctor fee — ডাক্তারের ফি"** and **"Services — সেবা"**, each with number, total, paid and balance. Never a combined "visit total due" without the breakdown. | C-008, FPR-03 |
| Paid indicator | A green "PAID" on the doctor fee card appears only on that card. The services card keeps its own status. | v0.3 DESIGN |
| Eligibility per line | Each service line shows **Ready** (eligible) or **Payment required** plus the amount. Departments see the same wording. | C-011, FR-BIL-003 |
| Method | Large method buttons (Cash, Card, Mobile, Bank transfer) with a provider field for Mobile (e.g., bKash) and a reference field. | C-010 |
| Amount entry | Prefilled with the selected lines' unpaid total. The cashier can deselect lines. Partial amounts require choosing a line (FR-BIL-012). Over-payment is prevented with an explanation (Q-022). | P-020 |
| Committed outcome | Outcome panel: "Payment saved · Receipt RCPT-2026-000045 · Services balance 700.00". Buttons: Print receipt, Next invoice. | FPR-15 |
| Uncertain outcome | Panel: "Checking whether the payment was saved…", then automatically "Saved" or "Not saved — nothing was charged; try again". **No "Pay again" button while checking.** | FR-BIL-036, SP-08 |
| Not configured | Discount/refund buttons are hidden. A small note says "Discounts and refunds are not set up for this hospital" when a cashier looks for them (FEATURE_NOT_AVAILABLE). | Q-019, Q-021 |
| Reprint | "Reprint (copy 2)". The receipt shows "COPY 2 / কপি ২". | FR-PRN-004 |

## 6. Worklist states and status vocabulary

| Domain | States (English / proposed Bangla) | Visual |
| --- | --- | --- |
| Doctor worklist | Expected / প্রত্যাশিত · Waiting for payment / পরিশোধের অপেক্ষায় · Waiting / অপেক্ষমাণ · In consultation / পরামর্শ চলছে · Done / সম্পন্ন | neutral · amber · blue · purple · green |
| Invoice | Issued / ইস্যুকৃত · Partly paid / আংশিক পরিশোধিত · Paid / পরিশোধিত · Cancelled / বাতিল | neutral · amber · green · grey |
| Service line | Payment required / পরিশোধ প্রয়োজন · Ready / প্রস্তুত | amber · green |
| Specimen | To collect · Collected · In transit · Received · Rejected (recollect) | neutral · blue · blue · green · red |
| Result | Awaiting · Entered · Verified · Released · Amended | neutral · blue · purple · green · green + "Amended" tag |
| Bed | Available · Occupied · Needs cleaning · Out of service | green · blue · amber · grey |
| Admission | Awaiting bed · Active · Discharge requested · Medically discharged · Departed (with dues flag) | amber · blue · purple · purple · grey (+ red "Dues") |

The Bangla labels are **PROPOSED** and need native review (Q-050). Final labels live in the `packages/i18n` catalogs.

## 7. Form validation, keyboard operation, accessibility and localization

### 7.1 Validation

- The same Zod schema runs on the client (React Hook Form resolver) and the server (ADR-005).
- Client validation runs on blur and submit. Server errors map to fields by path. The summary at the top links to the fields.
- Messages are specific and bilingual. Examples (PROPOSED wording):
  - "Enter the patient's age or date of birth" / "রোগীর বয়স অথবা জন্মতারিখ লিখুন"
  - "Phone number must have 11 digits after removing spaces" / "স্পেস বাদ দিয়ে ফোন নম্বরে ১১টি অঙ্ক থাকতে হবে"
- **Never** block legitimate clinical text, e.g., repeated abbreviations like "RBCs" (FR-LAB-018).

### 7.2 Keyboard operation (PROPOSED defaults; validate with staff)

| Key | Action | Scope |
| --- | --- | --- |
| `/` | Focus patient search | Global (when not typing in a field) |
| `Alt+Shift+N` | New registration | Front desk |
| `Alt+Shift+C` | Check in selected appointment | Front desk |
| `Alt+Shift+P` | Take payment for selected invoice | Cashier |
| `Enter` | Open selected row / add order item | Lists, order entry |
| `Ctrl+Enter` | Submit current form | Forms |
| `Esc` | Close dialog (with unsaved warning) | Dialogs |
| `Tab` / `Shift+Tab` | Move across result cells | Result grid |
| `F2` | Edit focused cell | Result grid |
| `Alt+Shift+L` | Print labels | Lab collection |

**Constraints:**
- Avoid browser-reserved keys: F1, F3, F5, F6, F7, F11, F12, Ctrl+W/T/N.
- Show shortcut hints in tooltips and in a "Keyboard shortcuts" help dialog (`?`).
- Make shortcuts configurable later if staff ask.
- Barcode scanners act as keyboard input. Scan fields accept fast input and submit on the scanner's Enter suffix.

### 7.3 Accessibility (target WCAG 2.2 AA, PROPOSED, NFR-ACC-001)

- Visible focus ring on every interactive element. Logical tab order. Skip-to-content link.
- Dialogs trap focus and return it on close. Toasts never carry the only copy of critical information (use inline outcome panels).
- Status changes on worklists are announced through an `aria-live="polite"` region ("3 new patients waiting").
- Contrast ≥ 4.5:1 for text. Status is text + icon + color.
- Hit targets ≥ 24×24 px; 44 px on nurse tablets.
- Forms have `<label>` elements. Errors are linked with `aria-describedby`.

### 7.4 Localization (C-025, ADR-017)

- Language switch in the top bar. Applies immediately, without losing form input (FR-I18N-001).
- `lang="bn"` / `lang="en"` set on `<html>` for correct font and screen-reader behavior.
- Fonts (ADR-022 section 5): English heading TikTok Sans, body Geist; Bangla heading and UI text Noto Sans Bengali, Bangla body Tiro Bangla (reading text only, one weight). Self-hosted, no CDN. Body 16 px, line height >= 1.6 for Bangla.
- Digits follow the UI language (C-036). Grouping is lakh and crore in both languages (C-057), for example 10,00,000.00, on screen and on print. Date pattern follows the tenant setting (Q-050). Stored data is unaffected.
- Bilingual fields (names, service names) use paired inputs labeled "নাম (বাংলা)" and "Name (English)". At least one is required where the SRS says so.
- Layouts tolerate roughly 30% longer strings. Buttons don't truncate critical words; tables wrap headers.

## 8. Loading, empty, denied, error, stale and recovery states

| State | Pattern | Example copy (EN / BN, PROPOSED) |
| --- | --- | --- |
| Loading (first) | Skeleton rows for lists; spinner only inside buttons; never a full-page spinner for longer than the timeout (SRC-B01) | — |
| Loading (slow > 5 s) | Inline message with Cancel and Retry; the page stays usable | "Still loading… Retry" / "এখনও লোড হচ্ছে… আবার চেষ্টা করুন" |
| Empty | Explain why, and the next action | "No patients waiting. New check-ins appear here automatically." / "কোনো রোগী অপেক্ষায় নেই।" |
| Denied (permission) | Inline panel; no data shown; the request is still audited | "You don't have permission to release results. Ask a lab authority." / "ফলাফল রিলিজ করার অনুমতি আপনার নেই।" |
| Not found / other tenant | Same as not found; no hint of existence | "Record not found." / "রেকর্ড পাওয়া যায়নি।" |
| Validation error | Field messages + summary | see §7.1 |
| Conflict (STALE_RECORD) | Dialog: "This record changed since you opened it", with what changed; Reload keeps the user's unsaved input in a side panel | "Someone else updated this invoice. Review the changes." |
| Business rule (e.g., PAYMENT_NOT_ELIGIBLE) | Inline explanation with the amount due and a link to the cashier queue | "Payment required: CBC 300.00 due" / "পরিশোধ প্রয়োজন: CBC ৩০০.০০ বাকি" |
| Not configured (FEATURE_NOT_AVAILABLE) | Neutral info panel | "Refunds are not set up for this hospital." |
| Uncertain outcome | Auto status check by idempotency key (§5) | "Checking whether it was saved…" |
| Offline / server down | Top banner; forms disabled; unsaved input kept in memory; link to the downtime procedure | "Connection lost. Nothing new can be saved. Use the downtime forms." |
| Stale list | "Updated 10:42:15" next to the title; turns amber after 2 intervals without a successful refresh; manual refresh button | "Last updated 2 min ago — Refresh" |
| Session expiring | Warning 2 min before idle timeout, with "Stay signed in" | — |

## 9. Tables: filtering, pagination and large data

- **Server-side** filtering, sorting and keyset pagination (D §8.2). Default page size 50, maximum 200.
- Filters are explicit controls (date range, status, ward, section). The current filter is shown as removable chips and persisted per user per screen (local preference only, no business data).
- "Load more" or infinite scroll for worklists. Numbered pages for reports.
- Large boards (bed board with hundreds of beds) use virtualization (TanStack Virtual) and group headers (floor/ward).
- Column choices per role. Sticky header. Keyboard row navigation (↑/↓, Enter).
- Exports are a separate permission (FR-REP-004). An export button triggers a background job when the result is large (FR-REP-005).
- Search debounce 250 ms. Minimum 2 characters (Bangla counted in grapheme clusters). Results limited to 20 with "refine your search" when more exist.

## 10. Print, report and label layouts

All layouts are **PROPOSED**. They must be validated on the pilot's printers (Q-046, UAT-PRN-*). Templates are bilingual-capable (FR-PRN-005). Every print shows record ID/number, version, print time (facility timezone), the user who printed, and "Copy n" for reprints.

| Document | Size / orientation | Content blocks (top → bottom) |
| --- | --- | --- |
| Receipt | A5 portrait (or 80 mm roll if adopted) | Hospital header (logo, name bn/en, address) · "Money receipt / মানি রিসিট" · receipt no., date/time · patient banner (name, MRN, age/sex) · **invoice type (Doctor fee / Services)** and invoice no. · lines paid (description, amount) · amount received, method (+ provider, reference) · invoice balance after payment · cashier name · copy marker · footer note |
| Doctor fee invoice / service invoice | A5 or A4 | Header · invoice type and no. · patient and visit · lines with category subtotals (medicine / non-medicine) · total, paid, balance · per-line status (Paid / Due) · expected report times for tests (FR-ORD-007) |
| Token / serial slip | A6 or receipt roll | Doctor, room, serial no., date, patient name and MRN |
| Prescription | A5 portrait (default) | Doctor header (name, degrees, registration) · patient banner · date · allergy status (FR-CLI-007) · Rx lines (medicine, dose, route, frequency, duration, instructions bn/en) · advice · next visit date · signature line · "Signed electronically by … at …" |
| Lab report | A4 portrait | Header · report title and section · patient (name, MRN, age/sex, ward/bed for IPD, SRC-L10) · referring doctor · specimen no., type, collected/received times · results table (test, result, unit, reference range text, flag) in the configured sequence (SRC-L06) · comments/advice (as entered, SRC-L04) · verified by / released by with times · **"Amended report" banner** with date when applicable · page x of y · report ID/version |
| Specimen label | Proposed 50 × 25 mm (Q-046) | Code 128 barcode of specimen number · specimen number (human-readable) · patient name (truncated) · MRN · age/sex · tube/specimen type · test short codes · collection time · ward/bed (IPD) |
| Bed / patient label | Proposed 70 × 35 mm or A6 (Q-046) | Name, MRN, admission no., bed/ward, admitting doctor, admission date. Printed from committed data on first attempt (SRC-N12). |
| Medicine return slip | A5 | Return no., ward, patient, lines (medicine, batch, qty returned), submitted by/time, pharmacy decision area |
| Final bill (RP-B) | A4 | Admission summary · charges by category with subtotals · accepted returns (credits) · payments listed once each · balance due/credit · "Final" + version |

**Print view implementation:** a dedicated route renders the document from the server's committed record and template version. CSS `@page { size: A5 portrait; margin: 10mm }`. Print preview is the same HTML. No business state changes (FPR-07).

## 11. Textual wireframes

### W-01 Front desk: search and register

```text
┌ Front desk ─────────────────────────────────────────────── Updated 10:41:02 ┐
│ Search patient (/)  [ 01700-000001                              ] [Search]  │
│ ┌ Results (2) ─────────────────────────────────────────────────────────────┐│
│ │ ▶ Rahim Uddin / রহিম উদ্দিন  ♂45  MRN-000123  01700000001  Last visit 01 Oct ││
│ │   Rahima Khatun             ♀38  MRN-000877  01700000001  Last visit 12 Aug ││
│ └──────────────────────────────────────────────────────────────────────────┘│
│ [Open (Enter)]  [New registration (Alt+Shift+N)]                             │
│ Today's appointments: Dr. Hasan 09:00–12:00 · 18 booked · 11 arrived         │
└──────────────────────────────────────────────────────────────────────────────┘
New registration
  Name (বাংলা) [            ]   Name (English) [            ]
  Sex ( ) Male ( ) Female ( ) Other ( ) Unknown    Age [  ] years  or  DOB [dd-mm-yyyy]
  Phone [           ]   NID (optional) [           ]   Address [                     ]
  ┌ Possible duplicates (2) ─ "same phone" ─────────────────────────────────────┐
  │ Rahim Uddin  ♂45 MRN-000123  [Use this patient]                             │
  └─────────────────────────────────────────────────────────────────────────────┘
  [Register as new] (asks to confirm when candidates exist)   [Cancel]
```

### W-02 Cashier desk

```text
┌ Cashier desk ─ Session: OPEN since 08:00 (cash float 2,000.00) ──────────────┐
│ [Patient banner: Rahim Uddin · MRN-000123 · OPD Dr. Hasan · Serial 12]        │
│ ┌ Doctor fee — ডাক্তারের ফি ───────┐  ┌ Services — সেবা ──────────────────────┐│
│ │ DF-2026-000311                   │  │ SI-2026-000812                         ││
│ │ Consultation (Dr. Hasan) 500.00  │  │ ☑ CBC            300.00  Payment req. ││
│ │ Total 500.00  Paid 0.00          │  │ ☑ Chest X-ray    700.00  Payment req. ││
│ │ Balance 500.00                   │  │ Total 1,000.00 Paid 0.00 Bal 1,000.00  ││
│ │ [Take payment (Alt+Shift+P)]     │  │ [Take payment]                         ││
│ └──────────────────────────────────┘  └────────────────────────────────────────┘│
│ Take payment — Doctor fee DF-2026-000311                                      │
│ Method: [Cash] [Card] [Mobile] [Bank]   Provider [bKash ▾]  Ref [         ]    │
│ Amount [ 500.00 ]   Lines: ☑ Consultation 500.00                              │
│ [Confirm payment (Ctrl+Enter)]   [Cancel (Esc)]                                │
│ ✔ Payment saved · Receipt RCPT-2026-000045 · Doctor fee balance 0.00          │
│   [Print receipt]  [Next: Services — 1,000.00 due]                            │
└───────────────────────────────────────────────────────────────────────────────┘
```

### W-03 Doctor worklist and consultation

```text
┌ My worklist · Tue 03 Nov · Medicine OPD 09:00–12:00 ─────── Updated 10:44:20 ┐
│ #  Patient            Status                Waiting                           │
│ 11 Salma Begum        Waiting               00:12      [Open]                 │
│ 12 Rahim Uddin        Waiting for payment   00:05      (cannot open yet)      │
│ 13 Karim Ahmed        Expected              —                                 │
└───────────────────────────────────────────────────────────────────────────────┘
┌ Consultation · Salma Begum ── Draft autosaved 10:46 ──────────────────────────┐
│ Complaint [..........] History [..........] Examination [......]              │
│ Assessment [..........]  Allergies: (•) Known ( ) None known ( ) Not asked    │
│ Orders: [type to search… ] ↵   CBC — Payment required   Chest X-ray — Payment req│
│ Prescription: [medicine…] dose [ ] route [ ] freq [ ] days [ ] fulfil (Hospital|Outside)│
│ Next visit: [ 17-11-2026 ▾ ]                                                  │
│ [Sign (Ctrl+Enter)]  [Print prescription]  [Request admission]                │
└───────────────────────────────────────────────────────────────────────────────┘
```

### W-04 Lab: result entry and verification

```text
┌ Result entry · Haematology ── Specimen S-2026-001044 · Rahim Uddin ♂45 ─────────┐
│ Test            Result     Unit      Ref. range (RV-3)     Flag                 │
│ Haemoglobin     [ 11.2 ]   g/dL      13.0–17.0             L                    │
│ WBC             [ 7.8  ]   10^9/L    4.0–11.0                                   │
│ Comment [ RBCs normocytic normochromic                                ]         │
│ [Save draft]  [Submit for verification]          Status: Entered (v1)           │
└─────────────────────────────────────────────────────────────────────────────────┘
┌ To verify (5) ─────────────┐┌ CBC · S-2026-001044 · v1 entered by tech1 10:52 ───┐
│ ▶ S-..1044 CBC Rahim  L    ││ Haemoglobin 11.2 L …                                │
│   S-..1047 LFT Salma       ││ [Verify]  [Send back (reason)]  [Release] (other user)│
└────────────────────────────┘└─────────────────────────────────────────────────────┘
```

### W-05 Bed board (RP-B)

```text
┌ Bed board · Floor 3 ─ Filter: [Ward ▾] [Status ▾] ──────────── Updated 11:02:10 ┐
│ Ward 3 (Medicine)                                                              │
│ [W3-01 Occupied  Rahim U. MRN-123 Dr Hasan 02 Nov] [W3-02 Available]           │
│ [W3-03 Needs cleaning (since 10:15) ⟲ Mark cleaned] [W3-04 Out of service]     │
│ [W3-E1 EXTRA · Occupied · Salma B.]                                            │
│ Awaiting bed (2): Karim A. (waiting 01:20) [Allocate]  …                       │
└────────────────────────────────────────────────────────────────────────────────┘
```

### W-06 Nurse: return medicines (RP-B)

```text
┌ Return medicines · Rahim Uddin · ADM-000001 · W4-02 ───────────────────────────┐
│ Issued line             Batch   Issued  Returned  Returnable  Return qty  Reason │
│ Ceftriaxone 1 g vial    B-77      4        0          4         [1]   [Unused] │
│ Paracetamol 500 mg tab  L-1      20        0         20         [5]   [Unused] │
│ [Submit return]  → Slip RET-88 printed · Status: Submitted (waiting for pharmacy)│
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 12. Proposed design system and library justification

| Layer | Proposal | Why here | Alternative |
| --- | --- | --- | --- |
| Styling | Tailwind CSS v4 with design tokens (CSS variables) for color, spacing, typography, density, defined once in `packages/ui` (ADR-022 sections 2 to 5) | Consistent dense layouts; print CSS in the same system; agents produce it reliably | CSS Modules |
| Components | `packages/ui`: in-house primitives on semantic HTML, each with a keyboard contract, test-first tests and an axe check (ADR-022 section 8). No styled kit. | Owned code, white-label ready; accessibility and keyboard behavior are requirements | React Aria Components if in-house contracts prove too costly |
| Forms | React Hook Form + Zod resolver | Large forms, shared schemas | TanStack Form |
| Tables | TanStack Table (headless) + TanStack Virtual | Full keyboard control; server-side data | AG Grid Community |
| Server state | TanStack Query | Polling, invalidation, uncertain-outcome checks | SWR |
| i18n | next-intl, catalogs in `packages/i18n` | ADR-017 | i18next |
| Icons | One family bundled locally, imported only through an `Icon` component (ADR-022 section 10) | Consistent status icons; a family swap is one file | Phosphor (default) or Tabler |

**Core custom components:**
- `PatientBanner`
- `InvoiceCard`
- `MoneyText` (formats `Money` per locale, never parses floats)
- `StatusBadge` (text + icon)
- `OutcomePanel` (Saved / Not saved / Checking)
- `StaleIndicator`
- `WorklistTable`
- `SearchCombobox` (scanner-friendly)
- `BilingualNameFields`
- `PrintFrame` (preview + print)
- `ConfirmDialog` with unsaved-changes guard
- `KeyboardHelp`

**Tokens:**
- Semantic status colors defined once (success, warning, danger, info, neutral), each paired with an icon.
- Two densities: comfortable for forms, compact for worklists.
- Print stylesheet tokens separate from screen.
- Status tokens are named by meaning (idle, active, review, attention, done, problem), not by hue (ADR-022 section 3).
- Screens compose layouts and patterns from `packages/ui`; they contain no raw widgets, color literals or shell breakpoint logic (ADR-022 section 9).

## 13. Usability validation

Before RG-3, run moderated sessions with real staff (front desk, cashier, lab, nurses) on synthetic data:
- timed tasks (SM-04)
- keyboard-only completion
- language switching
- printing on actual devices

Findings feed back into this document. See [I §4](I-manual-test-uat-plan.md#4-department-scenarios).
