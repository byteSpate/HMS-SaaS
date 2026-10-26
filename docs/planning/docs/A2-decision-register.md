# A2 — Decision register

| Control | Value |
| --- | --- |
| Document | A2 Decision register (authoritative location for all decisions) |
| Version | 0.4.0-draft |
| Status | Confirmed entries are binding; proposed entries await approval |
| Owner role | Product owner (business decisions); technical architect (engineering proposals) |
| Updated | 2026-10-14 (§2.4 Phase 0 answers; ADR approvals in §3) |
| Supersedes | `baseline/hospital-saas-planning-kit-v0.3/docs/DECISIONS.md` (all v0.3 IDs are kept unchanged) |
| Related | [A3 Open questions](A3-open-questions.md), [A4 Assumptions and contradictions](A4-assumptions-and-contradictions.md), [ADR index](D2-adr/README.md) |

This register is the **single authoritative location** for decisions. Other documents cite decision IDs and do not restate decisions with different wording. If a document appears to conflict with this register, this register wins, and the conflict is recorded in [A4](A4-assumptions-and-contradictions.md).

## 1. Status vocabulary

| Label | Meaning | Who may change it |
| --- | --- | --- |
| **CONFIRMED** | Settled by the product owner or by the requester in a recorded planning conversation. | Product owner only, through the amendment procedure in section 7. |
| **SOURCE-DERIVED** | Taken from one of the supplied hospital documents S1–S7 (see [SOURCES](../baseline/hospital-saas-planning-kit-v0.3/SOURCES.md)). It describes one hospital's needs. It becomes product behavior only after an adoption decision. v0.3 called this label `SOURCE`. | Domain lead proposes adopt / configure / defer / reject. Product owner approves. |
| **PROPOSED** | An engineering or planning recommendation in this pack. It must not be implemented as if approved, except inside a time-boxed spike. | The technical architect proposes; the product owner or tech lead approves. |
| **OPEN** | An unanswered question. Agents must not choose an answer. See [A3](A3-open-questions.md). | Answered by the named responder. |
| **DEFERRED** | Deliberately parked. It must not be silently implemented or silently ruled out. | Product owner. |

## 2. Confirmed decisions

### 2.1 Carried forward from v0.3 (wording preserved)

| ID | Decision | Implication for design | Date / source |
| --- | --- | --- | --- |
| C-001 | Whole-hospital ERP; each customer hospital gets its own installation and domain. | One maintained product; each installation has its own data and configuration. Amended 2026-10-26 by C-089 ([ADR-023](D2-adr/ADR-023-single-hospital-installation.md)). | v0.3 conversation; site pack C-089 |
| C-002 | Bangladesh is the initial market. | Capture local operational conventions. Government discussion is deferred (C-021). | v0.3 |
| C-003 | Stack direction: NestJS + Next.js + PostgreSQL + Turborepo. | The backend API owns business writes. Monorepo boundaries apply. | v0.3 |
| C-004 | AI agents drive software development. | Tasks need explicit specifications and evidence. See [G](G-implementation-plan.md). | v0.3 |
| C-005 | Main journey: registration → visit → service order → bill → payment → delivery → outcome → next visit. | Keep this order, but model the lifecycles separately. | v0.3 |
| C-006 | Appointment, walk-in and direct diagnostic visits are all supported. | A diagnostic visit does not need a doctor consultation. | v0.3 |
| C-007 | An appointment booking and the actual visit are distinct. | Check-in creates or links the visit. | v0.3 |
| C-008 | One combined outpatient service invoice per visit. The doctor's visit fee is issued on a separate invoice. | Independent invoices, balances and receipts. | v0.3 |
| C-009 | The cashier collects the doctor fee. | Access to the doctor worklist does not grant cashier authority. | v0.3 |
| C-010 | Cash, card, mobile payment and bank transfer are supported. | Each payment keeps its actual method. | v0.3 |
| C-011 | Payment comes before service. Both full payment and permitted partial/deposit payment are supported. | Service eligibility is configurable. Emergency exceptions are OPEN (Q-005). | v0.3 |
| C-012 | A patient may use the hospital pharmacy or an outside pharmacy. | Outside fulfilment never changes hospital stock. | v0.3 |
| C-013 | Admission can come from an OPD referral, an emergency referral, or a planned/direct route. | Keep the admission source and the linked visit. | v0.3 |
| C-014 | An admission may wait for a bed. | Admission status and bed occupancy are separate. | v0.3 |
| C-015 | Bed transfers are staff-controlled and keep history. | The software records movement. It does not decide clinical need. | v0.3 |
| C-016 | After discharge, the vacated bed must be cleaned before it is available again. | Completing cleaning is an authorized operation. | v0.3 |
| C-017 | IPD uses a running account, deposits/partial payments and final billing. | Final settlement policy is OPEN (Q-006). | v0.3 |
| C-018 | A next appointment may be called a "next visit". | The UI glossary distinguishes the booking from the attended visit. | v0.3 |
| C-019 | Lab processing includes review/release and tracking of rejection and recollection. | Exact reviewer authority is OPEN (Q-009). | v0.3 |
| C-020 | Existing decisions take precedence over the supplied documents. | Conflicts are flagged, and an explicit amendment is sought. | v0.3 |
| C-021 | Government-specific rules are deferred for this discussion. | Earlier legal notes are not turned into current requirements (DEF-001). | v0.3 |

**Identity and workflow agreements carried forward from v0.3 (CONFIRMED):**
- Patient search comes before new registration.
- A possible duplicate produces a warning and is never merged automatically.
- MRN generation belongs to the hospital/customer scope.
- NID is optional.
- An unknown emergency patient can have a temporary identity, reconciled later by an authorized user.
- Direct diagnostic ordering is configured per test.
- Staff assign emergency priority, and the software records who assigned it and when.

These appear as requirements in [C02](C-srs/C02-patients-scheduling.md) and [C10](C-srs/C10-emergency-daycare.md).

### 2.2 New confirmed decisions (planning conversation of 2026-10-12)

The requester answered these during this documentation task. **Ratified by the product owner on 2026-10-14.**

| ID | Decision | Implication | Replaces / resolves |
| --- | --- | --- | --- |
| C-022 | Source code is hosted on **GitHub**, and CI/CD runs on **GitHub Actions**. | The full pipeline templates are for GitHub Actions; images go to GHCR. The GitHub plan is still OPEN (Q-055), and it affects environment protection rules. | v0.3 "CI/CD, provider OPEN" |
| C-023 | Code quality uses **self-hosted SonarQube Community Build** (free). | Community Build analyzes only the main branch, so pull requests cannot be gated by Sonar. PR-level quality uses ESLint with the SonarJS plugin plus test and coverage checks. The Sonar quality gate on `main` blocks promotion to release. See [L](L-cicd-sonarqube.md) and [ADR-012](D2-adr/ADR-012-ci-quality-gates.md). | v0.3 "SonarQube concrete gate OPEN" |
| C-024 | Initial customer model: **one hospital per installation**. Multi-facility groups come later. | The data model keeps a facility layer, starting with exactly one facility. MRN scope is the installation. Group features are DEFERRED (DEF-002). | **Answers Q-002 for the initial product.** Group behavior stays deferred. |
| C-025 | Staff interface is **bilingual Bangla and English, switchable per user**, with **bilingual printouts**. | Every staff screen, message and print template needs both languages. Names and addresses support Bangla script. Exact per-document print-language rules and numeral style are OPEN (Q-050). | v0.3 "Bangla/English scope OPEN" |

### 2.3 Confirmed by the 2026-10-12 documentation brief

| ID | Decision | Implication |
| --- | --- | --- |
| C-026 | Deployment is designed for **VPS hosting**. No provider, server size or production topology has been selected. | [J](J-vps-deployment-operations.md) describes options and a single-VPS start with an expansion path. Nothing here names a provider as chosen. |
| C-027 | AI agents help **develop** the software. The product has **no autonomous clinical AI** features. | No automated diagnosis, triage, dosing or result interpretation. Clinical decisions remain with authorized staff. |
| C-028 | The "100,000 users" figure is an **unresolved capacity-planning question**, not a validated target or guarantee. | [M](M-capacity-performance.md) models registered, daily-active and concurrent scenarios. No document may claim support for 100k users without measured evidence (Q-041). |
| C-029 | Baseline integrity requirements are mandatory:<br>• server-side permission enforcement<br>• audit of sensitive actions<br>• clinical-record integrity (released or signed records are corrected, never overwritten)<br>• financial correctness (exact amounts, no duplicate postings, reconciliation) | These apply to every module, even while government rules are deferred. Mechanisms are PROPOSED; the obligations are CONFIRMED. |
| C-030 | Old delivery-duration and team-size estimates are **not** commitments. | No calendar dates, durations, team sizes or productivity multipliers appear in this pack. |

### 2.4 Phase 0 answers by the product owner (2026-10-14)

Answered by the product owner (Bytespate) on 2026-10-14 for the first release. "Configurable" means the value is the platform default and each hospital may change it through its policy settings (C00 §5); the default itself is the decision.

| ID | Decision | Implication | Resolves |
| --- | --- | --- | --- |
| C-031 | The first production release is **RP-A: outpatient + diagnostics** (B §9). | Phases 0–3 before go-live (G §2). Inpatient, pharmacy and stores stay on the legacy system or paper at first. | Q-001 |
| C-032 | Login security defaults: **TOTP MFA for administrator and finance roles**; sessions end after **60 minutes idle** and **12 hours** at most; an account **locks after 5 failed passwords for 15 minutes** (auto-unlock), and a hospital administrator may unlock it sooner. Configurable per hospital (CP-12). | The idle timeout is longer than the docs' 30-minute proposal because of the nurses' re-login complaints (SRC-N02/N10). | Q-051 |
| C-033 | MRN format: **hospital prefix + 6-digit continuous number**, never reset, e.g. `SMH-000123`. Pattern `{PREFIX}-{seq:6}`; the prefix is set per hospital (CP-09). | Unique per installation (fixed rule). | Q-034 |
| C-034 | Required registration fields: **name** (Bangla or English; at least one), **sex**, **age or date of birth**, **mobile number** (may be left empty only when the patient has none). Address is optional (CP-10). | Phone number is the main duplicate-search key. Unknown-identity emergency registration stays out of RP-A. | Q-035 |
| C-035 | Doctor queue: **fixed capacity per session, no overbooking, serial number in check-in order; walk-ins join the same queue** (CP-11). | Matches the docs' interim default; configurable per schedule. | Q-037 |
| C-036 | Digits follow the UI language: **Bangla digits in the Bangla UI, Western digits in the English UI**. Dates `dd-MM-yyyy`. Print language is chosen per template (CP-18). | Native-speaker review of terms still applies (A1). | Q-050 |
| C-037 | Invoice totals are **rounded to the nearest whole taka**, with the difference shown as an explicit **rounding adjustment line**, so totals always equal the detail (CP-07). | Line amounts stay exact to 2 decimals. The tie rule for exactly ½ taka and rounding of percentage discounts are still open (discounts are not in RP-A). | Q-020 (main part) |
| C-038 | **No overpayment:** a payment cannot exceed the open balance it pays; the cashier gives change. No patient credit in the first release. | `AMOUNT_EXCEEDS_BALANCE` stays the error. Patient credit and advances come with deposits (Q-004). | Q-022 |
| C-039 | **One payment may cover several open invoices of the same patient** (e.g. doctor fee + tests), with **one receipt** listing each invoice and amount. | Uses line-level payment allocation (P-020, ADR-016). | Q-024 |
| C-040 | **No deposits in the first release.** Every service is paid in full before it is done (`FULL_PAYMENT`, CP-02). | The deposit path stays disabled until Q-004/Q-040 are answered for inpatient (RP-B). | Q-004 (for RP-A) |
| C-041 | Doctor fees: per doctor, a **new-patient fee** and a **follow-up fee** that applies when the patient returns within that doctor's **follow-up window (days, set per doctor)**. Fee reductions/discounts are not implemented. | Price-list items per doctor (CP-05). No product default for the window: it must be entered per doctor. | Q-038 |
| C-042 | The **cashier both issues invoices and records payments**. The two permissions stay separate (`billing.invoice.issue`, `billing.payment.record`) so a hospital can split them later; both are granted to the Cashier template. | No segregation pair enforced by default (CP-24). All actions are audited. | Q-039 |
| C-043 | A payment-method correction made after the cashier session closed appears in a **"method corrections" section of the correction day's report**. Closed sessions and reports never change. | Collection reports reconcile with what finance already received. | Q-068 |
| C-044 | Pilot printers: **A4 laser** for lab reports and prescriptions, **80 mm thermal** for receipts and tokens, a **barcode label printer** for lab samples. Exact models are confirmed in device UAT. | Print templates target A4 and 80 mm first (CP-19). | Q-046 (device classes) |
| C-045 | Staff roles for the first release: the proposed templates **Receptionist, Cashier (incl. invoice issue, C-042), Billing supervisor, Doctor, Lab technologist, Lab authority, Finance, Hospital administrator, Management viewer** (C01 §5). | Starting set; each hospital still signs off its production role grants. | Q-003 (for RP-A) |
| C-046 | "100,000 users" means **total registered patient records across hospitals over time**, not daily or concurrent users. | Capacity planning uses the registered-records scenario (M). | Q-041 |
| C-047 | **GitHub Free plan; all three repositories private.** Deployment reads the private repository with read-only **deploy keys**. | Protected-branch rules for private repositories need a paid plan later. 2,000 free Actions minutes per month. | Q-055 |
| C-048 | The SonarQube server is **deferred**. Until then, ESLint with SonarJS rules in CI is the quality gate. | C-023 stands; only the server set-up date moves. | Q-056 |
| C-049 | Supabase **free plan** for development and testing; the Data API is **disabled** (done 2026-10-14). The plan is revisited before any real hospital data. | Free projects pause after 7 days idle (ADR-019). | ADR-019 open items |
| C-050 | **Development is local for now.** Staging deployment is owned by a team member; domains and hosting are not needed for current work. | ADR-020/021 remain the deployment design. | — |
| C-051 | Rounding tie rule: an invoice total at exactly half a taka **rounds up** (৳452.50 → ৳453; ৳452.49 → ৳452). | Completes C-037 for invoice totals. Rounding of percentage discounts stays open (discounts are not in RP-A). | Q-020 (tie rule) |

### 2.5 UI foundation decisions by the product owner (2026-10-15)

Recorded in [ADR-022](D2-adr/ADR-022-ui-foundation.md); the full values (tokens, breakpoints, layers) live there.

| ID | Decision | Implication | Resolves |
| --- | --- | --- | --- |
| C-052 | **Visual character:** calm clinical utility; dense layouts only in worklists and the lab result-entry grid. Every screen is designed and reviewed in Bangla first, then English. | Operate-mode tool (F section 1). No animation on keyboard-initiated actions. | ADR-022 s1, s13 |
| C-053 | **Three device tiers on Tailwind default breakpoints:** phone below 768, tablet 768 to 1279, desktop 1280 and up. Design widths 360, 768 and 1366 minimum. 44 px touch targets on phone and tablet. | No custom breakpoints. | ADR-022 s6 |
| C-054 | **Phone scope:** full support for login, choose hospital, language, doctor worklist and patient record view, ward list view, released lab report view and management dashboard. Payment, cashier session, registration, result entry, verify and release, price-list publish and audit search are tablet and desktop only and show a "use a tablet or computer" panel on a phone. | A mistyped payment is a money error; F principle 7 (unavailable is explicit). | ADR-022 s6 |
| C-055 | **Color system:** primary teal-700 on `mist` neutrals; secondary is an outlined button style; accent cyan-700 only for chart series 2, the "New" marker and shortcut chips; six status colors (idle, active, review, attention, done, problem) as soft badges with word and icon; teal is never a status. Light and dark token files are both created; dark stays off until reviewed. | Contrast measured from Tailwind 4.3.3 values. Accent is the only hue 37 degrees or more from every used hue. | ADR-022 s2 to s4 |
| C-056 | **Fonts:** English heading TikTok Sans, body Geist; Bangla heading and UI text Noto Sans Bengali, Bangla body Tiro Bangla (reading text only, it has one weight). One stack serves both languages. | Replaces ADR-017 item 5. Rendering and digit alignment are spike checks in T-UI-01. | ADR-022 s5 |
| C-057 | **Digit grouping is lakh and crore in both languages**, on screen and on print (10,00,000.00). Digits still follow the UI language (C-036). | Amends ADR-017 item 3. The hospital setting stays. | ADR-022 s11 |
| C-058 | **All UI behavior is built in-house** on semantic HTML: no native dialog, popover or date picker and no styled component kit. Packages only from the allow-list (Floating UI for positioning, TanStack Table/Virtual/Query, React Hook Form with Zod, next-intl, one icon family). Every primitive needs a keyboard contract, test-first tests and an axe check. | Replaces the shadcn / React Aria candidates of T-UI-01. Highest accessibility risk of the client; see ADR-022 consequences. | ADR-022 s8 |
| C-059 | **Reuse rules:** one token source and one component set in `packages/ui`; layers tokens, hooks, primitives, layouts, patterns; screens in `apps/web` only compose. Money, date and digit formatting only from `packages/i18n`. Enforced by lint rules and a contrast test required in T-UI-01. | Reusability is a design rule of the app, not a preference. | ADR-022 s9 |
| C-060 | **Branding:** two logo slots (the hospital logo, and a discreet "Powered by Bytespate"). The Bytespate logo is the placeholder hospital logo until a hospital exists. Hospital color override is not in RP-A; tokens are built so it can follow, guarded by a contrast check. | The product is shown to and sold to several hospitals. The logo is raster only; a vector master is needed before print templates. | ADR-022 s12 |

## 3. Proposed engineering decisions

**Approved by the product owner on 2026-10-14:** P-001, P-002, P-003, P-004 (ADR-001, ADR-003), P-007 (ADR-002), P-008 (ADR-004), P-009 (ADR-005), P-010 (ADR-006), P-016 (ADR-012). **P-017** (ADR-013, Jest) is superseded by ADR-018 (Vitest). **P-021** (version pins) is applied in [`docs/STACK_VERSIONS.md`](../../STACK_VERSIONS.md). The rows below keep their original wording.

All other entries are **PROPOSED** until the approver named in the "Approval needed" column accepts them. P-001 to P-006 keep their v0.3 meaning. Later entries refine or add to them. Each consequential proposal has an ADR.

| ID | Proposal | ADR | Approval needed / evidence |
| --- | --- | --- | --- |
| P-001 | Modular monolith: one NestJS API process plus a separate worker process sharing domain packages. | [ADR-001](D2-adr/ADR-001-modular-monolith.md) | Tech lead approval. The scaffold spike shows module boundaries enforced by lint. |
| P-002 | Hospital with facilities beneath it. | [ADR-023](D2-adr/ADR-023-single-hospital-installation.md) | **Partly settled by C-024.** One facility initially; the layer stays in the model. |
| P-003 | One PostgreSQL database per installation, no tenant key or row-level security (supersedes the shared-schema proposal). | [ADR-023](D2-adr/ADR-023-single-hospital-installation.md) | **Settled by ADR-023** (2026-10-26). |
| P-004 | One product codebase with versioned, effective-dated customer configuration (policy versions). No customer-specific branches. | [ADR-001](D2-adr/ADR-001-modular-monolith.md) | Product owner confirms the configurable-policy catalogue in [C00 §6](C-srs/C00-srs-overview.md#6-fixed-product-rules-versus-configurable-hospital-policies). |
| P-005 | Deliver in complete patient-journey slices. | — | Product owner chooses a release boundary (Q-001). See [B §9](B-business-requirements.md#9-proposed-release-boundaries). |
| P-006 | Supporting libraries: TanStack Query, React Hook Form, TanStack Table, Tailwind CSS, BullMQ, Redis-compatible store, S3-compatible storage, OpenAPI, OpenTelemetry. | [D1](D1-stack-assessment-and-versions.md) | Assessment complete in D1. Each library is approved by tech lead after the scaffold spike. |
| P-007 | Use Next.js (confirmed, C-003) as a staff workspace: client-rendered screens with TanStack Query, a server-rendered shell, **no Server Actions or Route Handlers that write business data**, and `output: 'standalone'`. | [ADR-002](D2-adr/ADR-002-nextjs-usage.md) | Tech lead approval. |
| P-008 | First-party authentication owned by NestJS:<br>• opaque server-side sessions in httpOnly cookies<br>• argon2id password hashing<br>• TOTP second factor for privileged roles<br>• account lockout with a visible reason | [ADR-004](D2-adr/ADR-004-authentication.md) | Product owner confirms MFA scope and timeouts (Q-051). |
| P-009 | Zod schemas in `packages/contracts` are the canonical API and event contract. OpenAPI is generated from them, and Prisma types never cross the API boundary. | [ADR-005](D2-adr/ADR-005-contracts.md) | The spike selects the OpenAPI generator compatible with NestJS 12 + Zod 4. |
| P-010 | Transactional outbox, inbox deduplication and idempotency records in PostgreSQL. BullMQ on a Redis-protocol server delivers and schedules jobs; PostgreSQL stays the source of truth. | [ADR-006](D2-adr/ADR-006-outbox-jobs.md) | Tech lead approval. Choose Redis 8 or Valkey after the compatibility spike. |
| P-011 | Money is stored as PostgreSQL `numeric(18,2)` with an explicit currency (BDT default). Domain arithmetic uses integer minor units, and rounding is explicit per policy. | [ADR-007](D2-adr/ADR-007-money.md) | The finance reviewer answers the rounding questions (Q-020). |
| P-012 | Bed occupancy is stored as half-open time intervals (`tstzrange`) with PostgreSQL exclusion constraints. | [ADR-008](D2-adr/ADR-008-bed-occupancy.md) | Tech lead approval. The extra-bed policy (Q-007) may add rules. |
| P-013 | Posted financial facts, stock movements, released results and signed clinical documents are append-only. Changes happen through correction, reversal or amendment records. | [ADR-009](D2-adr/ADR-009-append-only-ledgers.md) | Finance and clinical reviewers agree on the correction flows. |
| P-014 | Printing:<br>• browser print views (HTML/CSS) for routine desk output<br>• server-generated PDF from the same template and record version, rendered by headless Chromium in an isolated container, for archived, reprinted or delivered documents | [ADR-010](D2-adr/ADR-010-printing.md) | UAT on the customer's real printers (Q-046). |
| P-015 | Production starts on a single VPS running Docker Compose: Caddy reverse proxy, web, API, worker, PostgreSQL, Redis-compatible store. Object storage and backups are kept off the VPS. A documented expansion path follows. | [ADR-011](D2-adr/ADR-011-vps-topology.md) | Product owner accepts the single-host availability risk for the pilot, or chooses an expanded topology (Q-043). |
| P-016 | CI gates:<br>• PRs are blocked by lint (including SonarJS rules), typecheck, tests, coverage thresholds, migration checks and security scans<br>• SonarQube Community analysis of `main` gates promotion to release | [ADR-012](D2-adr/ADR-012-ci-quality-gates.md) | Tech lead approval. Confirm the GitHub plan (Q-055). |
| P-017 | Keep Jest (supplied foundation) for unit and API tests on Node ≥ 24.9 with ESM. Adopt Vitest only by an explicit decision if the Jest + ESM spike fails. | [ADR-013](D2-adr/ADR-013-test-runner.md) | Tech lead; resolves Q-054. |
| P-018 | Object storage through the S3 API. Do not adopt MinIO Community Edition for new production use: binary and image distribution stopped, and the repository is archived. Use provider object storage or a maintained self-hosted alternative (SeaweedFS, Garage). | [ADR-014](D2-adr/ADR-014-object-storage.md) | DevOps lead. Choose after the provider is selected (Q-044). |
| P-019 | Worklists refresh by polling with short intervals and conditional requests. Server-Sent Events are a later optimization when measurements justify them. | [ADR-015](D2-adr/ADR-015-worklist-refresh.md) | Tech lead. Revisit with load-test evidence ([M](M-capacity-performance.md)). |
| P-020 | Payment allocation is recorded at invoice-line level so per-service eligibility can be computed. The *policy* for choosing lines stays OPEN (Q-004, Q-024). | [ADR-016](D2-adr/ADR-016-payment-allocation.md) | The finance reviewer answers Q-004. |
| P-021 | Version pins for scaffold, per [D1 §4](D1-stack-assessment-and-versions.md#4-verified-versions-and-pinning-recommendation):<br>• Node 24 LTS now, re-evaluate Node 26 after its LTS promotion<br>• TypeScript 6.0.x<br>• NestJS 12.1.x<br>• Next.js 16.4.x plus the 2026-10-14 security release<br>• Prisma 7.10.x (CLI and client together)<br>• PostgreSQL 18.x current minor<br>• pnpm (exact version recorded in `packageManager`)<br>• Turborepo 2.11.x | [D1](D1-stack-assessment-and-versions.md) | Re-verify on the scaffold date and record the lockfile commit. |
| P-022 | Bilingual implementation:<br>• `next-intl` message catalogs (`bn-BD`, `en`)<br>• Noto Sans Bengali / Noto Sans fonts self-hosted<br>• print templates carry a language per output<br>• stored person names keep the script as entered | [ADR-017](D2-adr/ADR-017-localization.md) | Native-speaker review of terminology (Q-050). |

## 4. Deferred items

| ID | Item | Why deferred | Revisit trigger |
| --- | --- | --- | --- |
| DEF-001 | Government-specific requirements: statutory rules, mandatory reports, national health-record exchange, legally required hosting/retention. | Owner request (C-021). | Owner opens a separately scoped review. Its absence is **not** a completed compliance assessment. |
| DEF-002 | Multi-facility hospital groups: shared patients across facilities, group-level reporting, cross-facility transfers, facility-specific MRN series. | C-024. | First customer with more than one facility. |
| DEF-003 | Offline operation and synchronization. | Not requested. It is a large design commitment. | Pilot downtime discussion (Q-043) shows paper fallback is insufficient. |
| DEF-004 | Full PACS/archive implementation. | A radiology module does not imply a PACS. | A customer requires DICOM storage or viewing (Q-028). |

## 5. Superseded or partly answered items

| Earlier item | Now | Note |
| --- | --- | --- |
| v0.3 Q-002 (one hospital or group?) | Answered for the initial product by **C-024**. | Group behavior → DEF-002. |
| v0.3 "Bangla/English scope OPEN" | **C-025**. | Detail questions remain in Q-050. |
| v0.3 "CI/CD provider OPEN" | **C-022**. | — |
| v0.3 "SonarQube concrete gate OPEN" | **C-023** + P-016. | — |
| C-026 "no provider selected" | Partly answered: staging on DigitalOcean SGP1, database on Supabase (ADR-019, ADR-020). | Production server still open. |
| P-017 / Q-054 (test runner) | **ADR-018** (Vitest). | — |
| CX-015 (Redis vs Valkey licence) | **ADR-020** (Valkey). | — |

## 6. How decisions flow into the pack

```mermaid
flowchart LR
  Q[Open question in A3] -->|answered by named responder| C[Confirmed decision in A2]
  S[Source requirement SRC-*] -->|adoption review| C
  P[Proposal P-* / ADR] -->|approved| C
  C --> R[Requirement FR-*/NFR-* in C-srs]
  R --> T[Tests AT-*/UAT-*]
  R --> G[Tasks in G]
  T --> N[Traceability and release gates in N]
```

## 7. Amendment procedure

1. Keep stable IDs. Never reuse or renumber an ID.
2. A change to a CONFIRMED item creates a new row, for example `C-008a`, or a new ID with a "Replaces" note. Record:
   - date
   - approver
   - reason
   - the replaced text
   - affected workflows, requirements, data, contracts and tests
   - migration implications
3. Mark the old row "Superseded by …". Do not edit its wording to look as if it was always agreed.
4. Update [N Traceability](N-traceability-readiness.md) and any affected ready tasks in the same change.
5. ADRs keep their alternatives and consequences after approval. An ADR is superseded by a later ADR, never deleted.

## 8. Decision record template

```text
ID:            C-0NN | P-0NN | DEF-0NN
Title:
Status:        CONFIRMED | PROPOSED | DEFERRED | SUPERSEDED
Date / approver:
Context (link question/source):
Decision:
Consequences (data, contracts, UI, tests, operations):
Replaces:
Linked requirements / ADR / tests:
```
