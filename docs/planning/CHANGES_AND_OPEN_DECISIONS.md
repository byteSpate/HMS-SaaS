# Changes since v0.3 and unresolved decisions

**Pack version 0.4.0-draft · 2026-10-12 · decisions added 2026-10-13/15 (§0)**

## 0. Decisions made after the pack (2026-10-13/14)

The product owner made these decisions while the repository was scaffolded. They override the sections of D, J and K noted below. Those documents were updated on 2026-10-14 and carry an "Amended by" line.

| ADR | Decision | Replaces | Documents updated |
| --- | --- | --- | --- |
| [ADR-018](docs/D2-adr/ADR-018-vitest.md) | **Vitest** for unit/integration/API tests (Playwright stays for E2E) | ADR-013 (Jest); resolves **Q-054** | — |
| [ADR-019](docs/D2-adr/ADR-019-supabase-postgres.md) | Database is **PostgreSQL 17 on Supabase** (Singapore), used only as Postgres; tables in schema `hms`; UUIDv7 from Prisma | PostgreSQL 18 on the VPS, pgBackRest backups | D §4, J §3/§6/§8, K §2/§6/§7 |
| [ADR-020](docs/D2-adr/ADR-020-valkey-nginx-droplet.md) | **Valkey 9** for queues and cache; **host nginx + certbot** instead of Caddy; staging on the **existing DigitalOcean droplet (SGP1)**, shared with the ecommerce app | Redis vs Valkey choice (CX-015); Caddy | D §4, J §2–§5, K §2/§4 |
| [ADR-021](docs/D2-adr/ADR-021-separate-web-api-origins.md) | **Separate web and API hostnames**: `healthcare.bytespate.com` (web) and `healthcareapi.bytespate.com` (API), behind Cloudflare. CORS allow-list on the API, host-only session cookie, CSRF mandatory | Single domain with `/api/*` routed by the proxy | D §4/§6.1/§7.1, J §5, K §7 |
| [ADR-022](docs/D2-adr/ADR-022-ui-foundation.md) | **UI foundation**: visual system, in-house components, reuse rules (C-052..C-060) | The shadcn / React Aria choice of T-UI-01; ADR-017 items 3 and 5 | F section 2.3, 7.4, 12; G T-UI-01 |
| [ADR-023](docs/D2-adr/ADR-023-single-hospital-installation.md) | **One installation per customer hospital** (2026-10-26, from site pack C-089): own deployment, database and domain; no tenant key or row-level security | ADR-003 (shared-schema tenancy) | A1, A2, B, C00, C01, D, E, G, H, I, J, M, N; tenancy and SaaS platform planning removed |

**Questions answered:**
- **Q-054** (test runner): Vitest (ADR-018).
- **Q-044** (VPS provider/region): DigitalOcean, Singapore, for staging (ADR-020). The production server is still open.
- **CX-015** (Redis vs Valkey licence): Valkey (ADR-020).

**Verified in the repository** (details in [`docs/STACK_VERSIONS.md`](../STACK_VERSIONS.md) and the ADRs):
- the first migration applies on local PostgreSQL 17 and on Supabase's transaction pooler (T-FND-04).

**Phase 0 answers (2026-10-14):** the product owner answered the first-slice questions, approved ADR-001..006 and ADR-012, and ratified C-022..C-025. They are recorded as **C-031..C-051** in [A2 §2.4](docs/A2-decision-register.md#24-phase-0-answers-by-the-product-owner-2026-10-14); A3 marks each question answered. In short:
- release **RP-A**;
- MFA for admin + finance, **60 min idle / 12 h**, lock after 5 failures for 15 min;
- MRN `{PREFIX}-{seq:6}`; required fields name, sex, age/DOB, mobile;
- fixed-capacity queue with serial at check-in;
- digits follow the UI language;
- invoices rounded to whole taka (half rounds up, C-051) with an adjustment line;
- no overpayment, one payment may cover several invoices, no deposits;
- new/follow-up doctor fees; the cashier both bills and collects;
- method corrections on the correction day;
- A4 + 80 mm thermal + label printers; the proposed role templates;
- "100k users" = registered patient records;
- GitHub Free with private repositories; SonarQube server later;
- Supabase free plan with the Data API off; **local development only for now**.

Still open in RG-0: naming owners for the integrator, QA, DevOps and domain-reviewer roles (A0 §3). Still open for the slice: Q-042 (no pilot hospital yet; synthetic profile used), Q-043 (RPO/RTO, support hours) and the Q-046 device models.

**Open items from these decisions:**

| Item | Owner | Before |
| --- | --- | --- |
| Make the three GitHub repositories private (C-047) | Product owner | Now |
| Supabase plan above free (C-049) | Product owner | Any real hospital data |
| Restore drill (RB-07) against Supabase backups | DevOps | RG-1 |
| Give HMS its own registrable domain (ADR-021) | Product owner | Production (deferred: local only, C-050) |
| Staging deployment (T-FND-05, T-OPS-01) | Deployment owner (a team member) | Deferred (C-050) |
| Next.js security release of 2026-10-14: upgrade from 16.4.0 | Integrator | Any deploy |

**UI foundation decisions (2026-10-15):** [ADR-022](docs/D2-adr/ADR-022-ui-foundation.md), recorded as **C-052..C-060** in [A2 section 2.5](docs/A2-decision-register.md). In short:
- calm clinical look, designed Bangla first; phone, tablet and desktop tiers (cuts at 768 and 1280) with a limited phone scope;
- teal-700 primary on mist neutrals, cyan-700 accent for small jobs only, six status colors, dark tokens created but off;
- fonts TikTok Sans + Geist (English) and Noto Sans Bengali + Tiro Bangla (Bangla);
- lakh and crore digit grouping in both languages;
- all components built in-house behind a quality gate, with reuse enforced by layers and lint rules;
- the Bytespate logo is the placeholder hospital logo; hospital color override comes later.

**Open items from these decisions:**

| Item | Owner | Before |
| --- | --- | --- |
| Spike checks still open: Tiro Bangla on low-resolution 1366x768 monitors, Bengali digit alignment, Geist tabular figures (border value resolved: mist-500 `#67787c`; components and keyboard contracts built, see the T-UI-01 log) | UI lead | T-UI-01 done |
| Confirm icon family (Phosphor default, Tabler alternative) | Product owner | T-UI-01 start |
| Vector (SVG) master of the Bytespate logo | Product owner | Print templates |
| Hospital color override (guarded) | Product owner | When scheduled (needs SCR-23) |
| Native-speaker review of Bangla status labels (Q-050) | Native reviewer | RG-3 |
| Permission codes in the session so the shell can filter navigation (T-ACC-02) | Integrator | First role-based screen |
| Global handling of a 401 from any API call (expired flow) | UI lead | First data screen (T-UI-03) |

## 1. In one paragraph

v0.4 converts the v0.3 planning kit into a reviewable documentation set (documents A–N). The set has:
- 17 architecture decision records
- a requirement register of 292 IDs (FR + NFR)
- 196 automated and 81 manual/UAT test cases tied to requirement IDs
- illustrative Docker/Compose/Caddy/GitHub Actions/SonarQube/k6 templates
- a draft PostgreSQL schema that was **executed and probed on a scratch PostgreSQL 18.4**

All v0.3 decisions and requirement IDs are preserved. Four new decisions came from the planning conversation (C-022..C-025), and the brief's constraints are recorded as C-026..C-030. Everything the sources do not settle stays visible as OPEN (66 open questions, plus Q-002 now answered), with safe interim behavior. No clinical, billing, payroll, bed-charge or approval rule was invented.

## 2. What changed

### 2.1 New documents

| Area | v0.3 | v0.4 |
| --- | --- | --- |
| Guide and registers | INDEX, DECISIONS, OPEN_QUESTIONS, GLOSSARY | A0 guide (index, owners, versions, dependencies); A1 glossary with proposed Bangla labels; A2 decision register; A3 open questions (Q-001..Q-070 with interim handling); A4 assumptions and contradictions (new) |
| Business | PRD, WORKFLOWS | B BRD: 9 objectives, 16 business workflows, 15 source pain points, **3 release options (RP-A recommended default)**, 11 success measures (targets PROPOSED), 12 business acceptance criteria |
| Requirements | FUNCTIONAL_REQUIREMENTS (31 rows) + short module specs | C-srs: overview (actors, global preconditions, 15 fixed product rules, 24 configurable policies, standard paths, permission catalogue, error codes) + 14 module files with use cases, state machines, Given/When/Then, traceability, explicit gaps + NFR register with verification |
| Design | ARCHITECTURE, STACK, TENANCY, SYSTEM_DESIGN, API_CONTRACTS | D system design; D1 stack assessment with **verified versions (2026-10-12)**; 17 ADRs |
| Data | DATA, DATA_DICTIONARY, DATABASE_DESIGN_TEMPLATE | E database design + draft SQL + probes + validation log |
| UX | DESIGN | F UI/UX: role navigation, 27-screen inventory, flows, billing presentation rules, state patterns, keyboard map, print layouts, 6 textual wireframes |
| Delivery | AGENT_DEVELOPMENT, TASK template | G implementation plan: dependency phases, 79 task IDs (Phases 1–3 detailed, Phase 4 outlined), DoR/DoD, context packets, integrator rules, 4 fully worked tasks |
| Quality | TESTING_CI, NFR | H automated test plan (196 cases); I manual/UAT plan (81 cases, device matrix, downtime drills, defect severity) |
| Operations | OPERATIONS | J VPS operations (topologies T0–T4, sizing assumptions, backups, releases, 14 runbooks); K Docker; L CI/CD and SonarQube |
| Capacity | (none) | M capacity plan: parameterized model, the three "100k" interpretations computed, load-test method and proposed targets, expansion triggers |
| Traceability | TRACEABILITY, READINESS, RISK_REGISTER | N chains from objective to gate, readiness summary, release gates RG-0..RG-5, risks R-01..R-18 |

### 2.2 New confirmed decisions

| ID | Decision |
| --- | --- |
| C-022 | GitHub hosting; GitHub Actions CI/CD |
| C-023 | Self-hosted SonarQube **Community Build**. It analyzes `main` only, so PRs are gated by ESLint + SonarJS, tests and coverage, and the Sonar gate controls promotion. |
| C-024 | One hospital per customer now; multi-facility groups later (answers v0.3 **Q-002**; DEF-002) |
| C-025 | Bangla + English staff UI (switchable per user) and bilingual printouts |
| C-026..C-030 | From the brief: VPS hosting (no provider chosen); no clinical AI in the product; "100k users" is an open capacity question; baseline integrity requirements mandatory; no estimates carried over |

If the requester is not the product owner, the owner should ratify C-022..C-025.

### 2.3 Technical findings that changed recommendations (verified 2026-10-12)

- **TypeScript:** pin **6.0.x**. TS 7.0 is the npm `latest`, but `ts-jest` supports TS < 7 and the NestJS 12 CLI uses TS 6.0 (CX-018).
- **Prisma:** pin **7.10.x** for CLI and client. The `prisma` package's npm `latest` tag points to an 8.0 release candidate (CX-017).
- **NestJS 12** ships ESM. Jest with ESM-only Nest packages needs **Node ≥ 24.9**. Prisma 7 requires ESM. Keep Jest (supplied) but spike first (ADR-013, Q-054).
- **Next.js 16.4** is current. A security release is announced for **2026-10-14**; pin the patched version. `middleware` is now `proxy` and is not an authorization layer (ADR-002).
- `nestjs-zod` does not declare NestJS 12 support. Use a small in-house pipe plus `zod-to-openapi` or Zod 4 JSON Schema (ADR-005).
- **SonarQube Community Build** analyzes only the main branch (ADR-012).
- **GitHub required reviewers** for environments are unavailable on private repos below Enterprise. A maintainer-gated manual deploy workflow replaces them (CX-014).
- **MinIO Community Edition** is no longer distributed as binaries/images and its repository is archived. Do not adopt it; use provider storage, SeaweedFS or Garage (ADR-014). (Secondary source; re-confirm.)
- **Trivy GitHub Actions** were compromised in March 2026. All actions are SHA-pinned, and `pull_request_target` is avoided.
- **Promtail** reached end of life on 2026-03-02. Use Grafana Alloy.
- **PostgreSQL 18** has built-in `uuidv7()`. Exclusion constraints and append-only grants were demonstrated on a scratch 18.4 instance (24/24 probes passed, plus two concurrency races).

### 2.4 Contradictions found and how they are handled

See [A4 §2](docs/A4-assumptions-and-contradictions.md#2-contradictions-and-inconsistencies-found): CX-001..CX-020. Examples:
- hospital name spelling
- a missing `SAAS_ACCESS.md` link in v0.3
- lab stage vocabulary versus C-019
- conflicting bed-rent conventions
- discount without patient selection
- legacy delete buttons versus immutability

## 3. Decisions needed next (priority order)

1. **Q-001 release option.** Plan for RP-A (outpatient + diagnostics) unless the pilot needs inpatient on day one (RP-B). Also answer **Q-042 (pilot hospital profile)**.
2. **RG-0 approvals:** ADR-001 (modular monolith), ADR-002 (Next.js usage), ADR-004 (auth), ADR-005 (contracts), ADR-006 (outbox/jobs, plus Redis 8 vs Valkey licence choice), ADR-012 (CI gates), ADR-013 (Jest), P-021 (version pins).
3. **First-slice business answers (front desk + cashier):**
   - Q-003 (roles)
   - Q-020 (rounding)
   - Q-022 (overpayment)
   - Q-024 (one payment across two invoices?)
   - Q-034 (MRN format)
   - Q-035 (required fields, scripts)
   - Q-037 (queue/capacity)
   - Q-038 (doctor fee rules)
   - Q-039 (who issues invoices)
   - Q-046 (printers)
   - Q-050 (digits/dates/print languages)
   - Q-051 (MFA and timeouts)
   - Q-068 (method correction reporting day)
   - **Q-004 (deposits)**, or confirm deposits are excluded at first
4. **Operations:**
   - Q-043 (RPO/RTO, support hours)
   - Q-044 (VPS provider/region)
   - Q-055 (GitHub plan)
   - Q-056 (SonarQube host)
5. **Capacity meaning:** Q-041 ("100,000 users": registered, daily active or concurrent?).

## 4. All unresolved decisions (summary; the authoritative list is [A3](docs/A3-open-questions.md))

| Group | Open questions |
| --- | --- |
| Scope and customers | Q-001 release, Q-042 pilot profile |
| Roles and access | Q-003, Q-039, Q-051 |
| Identity and scheduling | Q-034, Q-035, Q-036, Q-037, Q-038 |
| Billing and finance | Q-004, Q-005, Q-006, Q-019, Q-020, Q-021, Q-022, Q-023, Q-024, Q-029, Q-040, Q-045, Q-061, Q-068 |
| Clinical and lab | Q-009, Q-010, Q-011, Q-012, Q-013, Q-017, Q-066, Q-067 |
| Inpatient, nursing, pharmacy, stock | Q-007, Q-008, Q-014, Q-015, Q-016, Q-018, Q-058, Q-060, Q-063, Q-069, Q-070 |
| Other modules | Q-025, Q-026, Q-027, Q-028, Q-030, Q-031, Q-032, Q-033, Q-064, Q-065 |
| Technology and operations | Q-041, Q-043, Q-044, Q-046, Q-047, Q-048, Q-049, Q-050, Q-053, Q-054, Q-055, Q-056 |
| Deferred (not open questions) | DEF-001 government/statutory, DEF-002 multi-facility groups, DEF-003 offline mode, DEF-004 PACS |
| Proposals awaiting approval | P-001..P-022 (A2 §3) |

## 5. Consistency checks run on this pack

Executed on 2026-10-12 with a script over all Markdown files (baseline excluded from link checks):

| Check | Result |
| --- | --- |
| Relative links resolve (files) | **305 links checked, 0 broken** |
| Heading anchors used in links exist | **0 missing** |
| Requirement, question, decision, assumption/contradiction, ADR, SRC, screen, use-case, task, gate and runbook IDs referenced anywhere are defined in their authoritative documents | **0 undefined** |
| Test IDs (AT-*, UAT-*) referenced in B, C, G, N are defined in H or I (ranges expanded) | **0 undefined** |
| No requirement marked "Verified" in N (there is no code yet) | **0 found** |
| Baseline v0.3 files byte-identical to the supplied ZIP (SHA-256 of all 54 files) | **54/54 identical, no extra files** |
| Draft SQL executed on scratch PostgreSQL 18.4 | Schema loaded. 24/24 probes PASS. Two two-session races behaved as designed. |
| Workflow templates | YAML parsed; `actionlint` 1.7.7 reported no findings (shellcheck unavailable) |
| Compose templates | YAML parsed (not run) |
| Mermaid diagrams | All 18 rendered with mermaid-cli 11. Four syntax errors were found and fixed: semicolons in sequence messages, and parentheses in one edge label. |

## 6. Known limitations of this pack

- **No application code exists.** Every "evidence" item in N is planned, not achieved.
- Docker images, Compose stacks, the Caddyfile and the CI workflows were **not executed**.
- Version facts were verified from the npm registry and official documentation on 2026-10-12. Re-verify on the scaffold date (D1 §6).
- Bangla labels and messages are **proposals** that need native-speaker review.
- Sizing and performance numbers are **assumptions or proposed targets**, not measurements.
- Finance, HR/payroll, emergency, OT, radiology, portal, B2B and referrals are **explicit gap specifications**, not designs.
- Government and statutory topics are deferred. **This pack makes no compliance claim.**
