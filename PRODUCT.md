# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router, client-heavy staff screens), React 19, Tailwind CSS 4, in a Turborepo with a NestJS API. UI components are built in-house in `packages/ui` (ADR-022). Decided by the product owner; see `docs/planning/docs/D-system-design.md`.

## Users

Staff of a hospital in Bangladesh, working at a desk or ward station while a patient or relative waits:

- front desk (registration, check-in, appointments), cashier (invoices, payments, receipts), doctors (worklist, consultation, prescriptions), nurses (ward list, indents, returns), lab technologists and lab authorities (collection, result entry, verify and release), pharmacy, billing supervisors, finance, hospital administrators and management.

Secondary, later: patients and relatives (appointment booking, report download). Devices are PCs at desks (1366x768 and up), tablets on wards and in the lab, and phones for look-up and light actions. Many users type Bangla with phonetic input methods.

## Product Purpose

A multi-tenant hospital ERP sold as SaaS by Bytespate. The first release (RP-A) covers outpatient care and diagnostics: registration, appointments, doctor consultation, billing and payment, and laboratory. Success is a hospital desk that works without thinking: the right patient, the right invoice, the committed truth, in Bangla or English, with a keyboard.

## Positioning

What a neighboring hospital product cannot truthfully copy without redesign (from the planning pack, F section 1 and C-008, C-011):

- Doctor-fee invoice and service invoice are always separate, with separate balances.
- Services are payable before they are done, and every department sees the same "Ready" or "Payment required" wording.
- The patient context is always visible and re-checked by the server, so a stale tab or a copy-paste cannot act on the wrong patient.
- The screen says "Saved" only after the server confirms; an uncertain outcome is shown as "checking", never as success or failure.

## Operating Context

- Busy reception, cashier, collection and result-entry desks; keyboard operation and barcode scanners that act as keyboard input.
- Printers: A4 laser (reports, prescriptions), 80 mm thermal (receipts, tokens), a label printer (specimens). Paper is monochrome.
- Bangladesh conventions: Bangla and English, Bangla digits in the Bangla UI, taka with lakh and crore grouping, 11-digit mobile numbers, mobile payment providers such as bKash.
- Connection loss and downtime are expected states with a visible procedure, not exceptions.
- Each hospital is a separate tenant; data never crosses tenants.

## Capabilities and Constraints

- WCAG 2.2 AA, keyboard-first, status always as word plus icon plus color.
- Bilingual with Bangla first: layouts tolerate roughly 30 percent longer strings; fonts are self-hosted, no CDN at runtime.
- No Server Actions for business data; all business reads and writes go through the API (ADR-002).
- Money is never a float; whole-taka rounding with an explicit adjustment line (C-037, C-051).
- Release scope, roles and unresolved questions live in `docs/planning/docs/A2-decision-register.md` and `A3-open-questions.md`.
- Undecided: pilot hospital profile (Q-042), exact printer models, tenant color override, native-speaker approval of Bangla terminology (Q-050).

## Brand Commitments

- The product is shown to and sold to several hospitals. Each hospital's own logo and name appear in the shell and on every printout; a discreet "Powered by Bytespate" is the product brand.
- Until a hospital exists, the Bytespate logo is the placeholder tenant logo. Its brand colors (pure red and green) must not sit beside status colors.
- Tone: plain, specific, calm. No marketing language, no humor, no filler verbs, in either language.

## Evidence on Hand

- No pilot hospital, no real patient data, no testimonials, customers or benchmarks. Do not invent any.
- Bytespate logo files (raster only): lockup, square mark and dark variant, currently in the sibling project `HR-MNG-V1/client/public/brand`. A vector master does not exist yet.
- Bangla labels in the planning pack are proposals pending native-speaker review.

## Product Principles

1. Right patient, every time: context is visible and verified.
2. Show committed truth only.
3. Separate things look separate.
4. Unavailable is explicit: never a half-working control.
5. One implementation of everything: tokens, components, layouts and formatters are shared, so a change is made once (ADR-022).

## Accessibility & Inclusion

- WCAG 2.2 AA target (NFR-ACC-001): visible focus, logical tab order, skip link, dialogs trap and return focus, live regions announce list changes, no information by color alone (color-blind staff and monochrome print).
- Touch targets 44 px on phone and tablet; 24 px minimum on desktop.
- Reduced motion honored. Never toast-only for critical information.
- Language switch applies immediately without losing form input; `lang` is set on the document.
