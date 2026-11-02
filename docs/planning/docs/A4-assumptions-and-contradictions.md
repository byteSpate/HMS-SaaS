# A4 — Assumptions and contradictions

| Control | Value |
| --- | --- |
| Document | A4 Assumptions (AS-*) and contradictions / inconsistencies (CX-*) |
| Version | 0.4.0-draft |
| Status | Working register. Each assumption must be confirmed or replaced before the gate it names. |
| Owner role | Technical architect (assumptions); product owner (resolving contradictions) |
| Updated | 2026-10-12 |

An **assumption** is something this pack takes as true so drafting can continue. It is weaker than a decision. Every assumption names the gate where it must be confirmed. A **contradiction** is a place where sources, decisions or technical facts disagree. It names the resolution used in this pack and who must confirm it.

## 1. Assumptions

| ID | Assumption | Basis | Used in | Confirm before |
| --- | --- | --- | --- | --- |
| AS-001 | Currency is Bangladeshi Taka (ISO 4217 `BDT`), stored to 2 decimal places (poisha). | Bangladesh market (C-002). ISO minor unit 2. | E money columns; C04 | RG-1. Display rounding remains Q-020. |
| AS-002 | Facility timezone is `Asia/Dhaka` (UTC+06:00, no daylight saving). Business dates (cash day, bed day) use the facility timezone. | v0.3 DATA/BANGLADESH notes. | E time rules; C06; tests | RG-1. A facility timezone setting exists for later markets. |
| AS-003 | Staff work on desktop or laptop computers with current Chromium-based browsers (Chrome/Edge) or Firefox, at 1366×768 or larger. Nurses may also use tablets. | Typical hospital workstation estate. Not confirmed. | F layouts; I device tests | RG-3 (pilot device survey, Q-042/Q-046). |
| AS-004 | Hospitals reach the cloud VPS over the internet. No offline mode (DEF-003). Outages use a paper downtime procedure. | v0.3 OPERATIONS; C-026. | J runbooks; I downtime drills | RG-3. |
| AS-005 | One facility per tenant initially (C-024), so "MRN unique per tenant" is enough. | C-024. | E constraints | Before DEF-002 is opened. |
| AS-006 | The pilot hospital resembles the source hospital (Sondhany Medical): OPD, diagnostics/lab, IPD, nursing, pharmacy. | S1–S7. Not confirmed as the pilot. | B release options; M scenarios | Q-042. |
| AS-007 | Payments in the first release are recorded manually (method + reference). No online gateway. | C-010 records methods only; Q-045 open. | C04; D gateway section designed but marked future | Q-045. |
| AS-008 | Lab results are entered manually in the first release. Analyzer interfaces come later. | v0.3 ROADMAP note; Q-047 open. | C05; C14 | Q-047. |
| AS-009 | Non-production environments contain **only synthetic data**. Real patient data appears only in production, or in a separately approved migration rehearsal environment. | v0.3 AGENTS. | H fixtures; J environments | Always. |
| AS-010 | The SaaS vendor (the company operating the product) runs the VPS environments and the vendor console. Hospital IT does not have server access. | SaaS model (C-001). | J access model; C01 vendor support | RG-4 (contracts). |
| AS-011 | Staff counts, visit volumes and growth figures in [M](M-capacity-performance.md) and the examples are **synthetic planning inputs**, not measurements. | No pilot profile yet. | M; H load tests | Q-042. |
| AS-012 | Code, identifiers, database names and API fields are in English. Bangla appears in message catalogs, configuration data (service names, report templates) and user-entered data. | C-025 and common practice. | D, E, F | RG-1. |
| AS-013 | The GitHub repository is private and owned by an organization account. | C-022; plan unknown. | L (gitleaks licence, environment rules) | Q-055. |
| AS-014 | Prices are configured as tax-exclusive amounts. No VAT/tax lines on patient invoices. | Tax and government rules are DEFERRED (DEF-001). | C04, E | DEF-001 review. **No tax logic is invented.** |
| AS-015 | A visit belongs to one facility and one department of service at creation. Later orders may target other departments. | Common OPD practice. | E Visit | Q-037 / pilot walkthrough. |
| AS-016 | Each staff user has one personal account. Shared logins are not supported. | Audit requirement (C-029). | C01 | Q-051 (shared workstation handling). |

## 2. Contradictions and inconsistencies found

| ID | What disagrees | Where | Resolution used in this pack | Needs confirmation by |
| --- | --- | --- | --- | --- |
| CX-001 | The hospital name is spelled **"Sondhany"** (S6, S7, v0.3 CONTEXT) and **"Sodhani"** (S4, S5 file names). | SOURCES | Use "Sondhany Medical" as in v0.3 CONTEXT. Source codes S4/S5 keep their original file names. | Product owner |
| CX-002 | v0.3 MODULES.md links `modules/SAAS_ACCESS.md`, which is not in the pack. | baseline MODULES.md | SaaS/access content is consolidated in [C01](C-srs/C01-platform-access-audit.md). The baseline file is not edited. | — (resolved) |
| CX-003 | The lab vocabulary differs:<br>• sources: "prepared / verified / finalized / release"<br>• C-019: "review / release" | S4–S7, C-019, LAB spec | C-019 takes precedence (C-020). The pack models Entered → Verified → Released, with "finalized" treated as a synonym of Released **pending Q-009**. | Pathologist |
| CX-004 | Status label "SOURCE" (v0.3) vs "SOURCE-DERIVED" (2026-10-12 brief). | v0.3 docs | Same meaning. This pack writes SOURCE-DERIVED. | — (resolved) |
| CX-005 | Bed rent conventions conflict: noon-to-noon day vs 6 p.m. posting, plus transfer and extra-bed boundary rules. | SRC-I07 | No formula implemented. Manual bed charges in the interim (Q-007). | Finance + IPD |
| CX-006 | Source documents have inconsistent date/version labels and menu counts. | SOURCES | Capabilities kept; counts and package sizes not derived from them. | — |
| CX-007 | The SRS cites a Billing Feedback Report (27 issues / 22 requirements) that was not supplied. | SOURCES | Billing source requirements are labelled "via S6/S7 consolidation", never as direct review of the original report. | Product owner (provide the original if available) |
| CX-008 | "Next visit" (C-018) is used for a booking, while "visit" elsewhere means an attended encounter. | C-018, GLOSSARY | UI label "Next visit (appointment)" on booking screens. Data model uses `appointment`. | Native-speaker + pilot reviewer (Q-050) |
| CX-009 | Discount without patient selection (SRC-O03) conflicts with traceability (C-029): every discount must attach to an invoice and patient. | SRC-O03, C-029 | Not adopted. Kept as Q-019 for business clarification. | Finance |
| CX-010 | Source screens have Add/Edit/**Delete** buttons for released results and posted bills. This conflicts with immutability (C-029, P-013). | S1, ACCESS_CONTROL | Corrections via amendment/reversal records. No delete of released or posted evidence. | — (C-029 governs) |
| CX-011 | Jest is the supplied test foundation, but NestJS 12's generated ESM projects default to Vitest, and Prisma 7 requires ESM. Jest can load ESM-only NestJS 12 packages only on Node ≥ 24.9. | Supplied foundation; NestJS v12 migration guide; Prisma 7 upgrade guide | Keep Jest on Node ≥ 24.9 (P-017). Spike before committing. Q-054 records the choice. | Tech lead |
| CX-012 | `nestjs-zod` (a common Zod ↔ NestJS bridge) declares peer support only for NestJS 10/11 as of 2026-10-12. Its use with NestJS 12 is unverified. | npm registry peer dependencies | Use a small in-house Zod validation pipe plus `@asteasolutions/zod-to-openapi` (peer `zod ^4`) or Zod 4's JSON Schema output. Decided in the spike (ADR-005). | Tech lead |
| CX-013 | The brief asks for "pull-request checks … quality gates" with SonarQube, but SonarQube Community Build analyzes only the main branch. Branch/PR analysis starts in Developer Edition. | C-023; Sonar docs | PRs are gated by ESLint + `eslint-plugin-sonarjs`, tests, coverage and security scans. The Sonar gate on `main` blocks release promotion (ADR-012). | Tech lead |
| CX-014 | GitHub "required reviewers" environment protection is not available for **private** repositories on Free/Pro/Team plans. | GitHub docs | Production approval is designed with a protected manual workflow plus branch/tag protections. Upgrade to Enterprise if formal reviewers are mandatory (Q-055). | Product owner |
| CX-015 | v0.3 proposes "BullMQ + Redis". Redis 8 is distributed under AGPLv3 (among other licences); Valkey is a BSD-licensed fork. | v0.3 STACK; Redis/Valkey announcements | Either is technically acceptable if BullMQ compatibility is proven. The licence choice is a product-owner decision (P-010). **No legal conclusion is made here.** | Product owner |
| CX-016 | v0.3 proposes "S3-compatible object storage". The most common self-hosted option (MinIO Community Edition) stopped publishing binaries and images in October 2025, and its repository was archived in 2026. | v0.3 STACK; secondary source (see D1) | Do not adopt MinIO CE for new production deployments. Use provider storage or SeaweedFS/Garage (P-018). | DevOps lead |
| CX-017 | npm `latest` for the `prisma` CLI points to `8.0.0-rc.22`, while `@prisma/client` `latest` is `7.10.0` (2026-10-12). | npm registry | Pin both to the same 7.10.x version. Never install `prisma@latest` unpinned. | Integrator |
| CX-018 | TypeScript `latest` is 7.0.2, but `ts-jest` declares `typescript <7` and the NestJS 12 CLI depends on `~6.0.2`. | npm registry | Pin TypeScript 6.0.x (P-021). | Tech lead |
| CX-019 | Next.js announced an out-of-band security release for 2026-10-14, covering two critical and one high-severity vulnerabilities in upstream dependencies. | Next.js blog, 2026-10-08 | Scaffold pins the first patched 16.4.x (or later) release after 2026-10-14, never 16.4.0. | Integrator |
| CX-020 | v0.3 ARCHITECTURE names packages `domain-*`. This pack uses `mod-*` for business modules and keeps `domain-kernel` for shared primitives. | baseline ARCHITECTURE | Naming only. D is authoritative for package names. | Tech lead |

## 3. Things deliberately **not** assumed

The pack does **not** assume any of the following. They remain OPEN or DEFERRED:

- bed-rent formulas
- discount limits or rounding to whole taka
- refund approvers
- deposit allocation order
- emergency payment exceptions
- discharge-with-dues behavior
- lab reviewer separation or calculated-test formulas
- medicine substitution, unit conversion or FEFO selection
- payroll rules
- chart of accounts
- statutory obligations
- RPO/RTO values
- the meaning of "100,000 users"
- hosting provider
- the first release scope
