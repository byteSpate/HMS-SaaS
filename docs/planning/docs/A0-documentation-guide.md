# A0 — Documentation guide

| Control | Value |
| --- | --- |
| Document | A0 Documentation guide: reading order, index, ownership, conventions |
| Version | 0.4.0-draft |
| Status | Current |
| Owner role | Product owner (pack maintainer) |
| Updated | 2026-10-12 |
| Baseline | The v0.3 planning kit is preserved byte-for-byte in [`baseline/hospital-saas-planning-kit-v0.3/`](../baseline/hospital-saas-planning-kit-v0.3/README.md). |

## 1. What this pack is

This is the v0.4 documentation set for a **whole-hospital ERP sold as SaaS** to multiple independent hospitals, starting in Bangladesh. It turns the v0.3 planning kit into the documents a developer or AI coding agent needs:

- business requirements
- software requirements
- system and database design
- UX guidance
- an implementation plan
- test plans
- deployment, Docker and CI/CD design
- capacity planning
- traceability

It is **documentation and illustrative configuration only**. No application code exists yet. No configuration in [`templates/`](../templates/README.md) has been executed, except where a document says exactly what was checked.

The pack follows five rules from the brief:

1. Confirmed decisions are preserved. Nothing from legacy behavior or engineering preference silently replaces them.
2. Every important statement carries a status label (CONFIRMED / SOURCE-DERIVED / PROPOSED / OPEN / DEFERRED).
3. Missing clinical, billing, payroll, bed-charge and approval rules are **not inferred**. They are listed in [A3](A3-open-questions.md).
4. Government-specific requirements are deferred (DEF-001). No legal or compliance claim is made.
5. Each rule has **one authoritative location**. Other documents link to it.

## 2. Reading paths

| If you are… | Read in this order |
| --- | --- |
| **Product owner / hospital stakeholder** | A0 → [A2 Decisions](A2-decision-register.md) → [A3 Open questions](A3-open-questions.md) → [B BRD](B-business-requirements.md) → [N Readiness](N-traceability-readiness.md) |
| **Domain reviewer** (finance, lab, nursing, pharmacy) | [A1 Glossary](A1-glossary.md) → [C00 SRS overview](C-srs/C00-srs-overview.md) → your module file in [C-srs](C-srs/) → [I UAT plan](I-manual-test-uat-plan.md) |
| **Technical architect / tech lead** | [D System design](D-system-design.md) → [D1 Stack](D1-stack-assessment-and-versions.md) → [ADRs](D2-adr/README.md) → [E Database](E-database-design.md) → [M Capacity](M-capacity-performance.md) |
| **Coding agent (per task)** | [G §5 Context packet](G-implementation-plan.md#5-context-packet-for-each-agent-task), then **only** the files listed in the task's context packet. The baseline [AGENTS.md](../baseline/hospital-saas-planning-kit-v0.3/AGENTS.md) rules still apply. |
| **QA lead** | [H Automated tests](H-automated-test-plan.md) → [I Manual/UAT](I-manual-test-uat-plan.md) → [N Traceability](N-traceability-readiness.md) |
| **DevOps** | [J VPS operations](J-vps-deployment-operations.md) → [K Docker](K-docker-design.md) → [L CI/CD](L-cicd-sonarqube.md) → [templates](../templates/README.md) |
| **UX designer** | [F UI/UX](F-ui-ux-design.md) → relevant C-srs module files → [A1](A1-glossary.md) Bangla labels |

## 3. Document index

**Status key:**
- **Draft-for-review**: complete enough to review, not approved.
- **Proposal**: an engineering recommendation awaiting approval.
- **Register**: a living list.

Owner roles are responsible for review and approval. No individual is named until the owner assigns people.

| ID | Document | Purpose | Status | Owner role | Depends on |
| --- | --- | --- | --- | --- | --- |
| A0 | [Documentation guide](A0-documentation-guide.md) | Reading order, index, conventions | Current | Product owner | — |
| A1 | [Glossary](A1-glossary.md) | Terms, code names, proposed Bangla labels | Register | Product owner + domain lead + native reviewer | A2 |
| A2 | [Decision register](A2-decision-register.md) | All CONFIRMED / PROPOSED / DEFERRED decisions | Register (authoritative) | Product owner; architect for P-* | baseline |
| A3 | [Open questions](A3-open-questions.md) | Every unanswered question with interim handling | Register (authoritative) | Product owner | A2 |
| A4 | [Assumptions and contradictions](A4-assumptions-and-contradictions.md) | Working assumptions; inconsistencies and how they are handled | Register | Architect + product owner | A2, A3 |
| B | [Business requirements (BRD)](B-business-requirements.md) | Problem, objectives, stakeholders, scope, workflows, release options, success measures | Draft-for-review | Product owner | A1–A4 |
| C00 | [SRS overview](C-srs/C00-srs-overview.md) | Conventions, actors, global rules, fixed vs configurable policies, permission catalogue | Draft-for-review | Architect + domain lead | B |
| C01–C14 | [SRS module files](C-srs/) | Functional requirements per module, with use cases, states, permissions, G/W/T examples, gaps | Draft-for-review (finance/HR largely OPEN) | Domain reviewer per module | C00 |
| C15 | [Non-functional requirements](C-srs/C15-non-functional-requirements.md) | Quality requirements and verification | Draft-for-review | Architect + QA lead | C00, M |
| D | [System design](D-system-design.md) | Architecture, runtime, boundaries, tenancy, auth, contracts, transactions, jobs, cache, observability | Proposal | Technical architect | C, D1, ADRs |
| D1 | [Stack assessment and versions](D1-stack-assessment-and-versions.md) | Tool suitability, alternatives, verified versions with review date | Proposal | Technical architect | D |
| D2 | [ADRs](D2-adr/README.md) | 17 architecture decision records | Proposal | Technical architect | D |
| E | [Database design](E-database-design.md) | ERD, data dictionary, PostgreSQL design, RLS, Prisma mapping, migrations, backups | Proposal | Architect + integrator | C, D |
| F | [UI/UX design](F-ui-ux-design.md) | Navigation, screens, flows, states, accessibility, localization, print layouts | Proposal | UX lead + domain lead | C |
| G | [Implementation plan](G-implementation-plan.md) | Phases, epics, tasks, DoR/DoD, context packets, coordination | Proposal | Tech lead | C, D, E |
| H | [Automated test plan](H-automated-test-plan.md) | Test layers, cases, fixtures, CI evidence | Proposal | QA lead | C, D, E |
| I | [Manual test and UAT plan](I-manual-test-uat-plan.md) | Department scenarios, devices, downtime drills, defects | Proposal | QA lead + domain leads | C, F |
| J | [VPS deployment and operations](J-vps-deployment-operations.md) | Topologies, sizing assumptions, security, backups, releases, runbooks | Proposal | DevOps lead | D, K |
| K | [Docker design](K-docker-design.md) | Images, Compose layouts, secrets, env inventory | Proposal (templates untested) | DevOps lead | D, J |
| L | [CI/CD and SonarQube](L-cicd-sonarqube.md) | GitHub Actions pipeline, quality gates, scanning, deployment | Proposal (templates untested) | DevOps lead + tech lead | K, H |
| M | [Capacity and performance](M-capacity-performance.md) | User scenarios, load model, scaling, load tests, triggers | Proposal | Architect | C15, D, E |
| N | [Traceability and readiness](N-traceability-readiness.md) | Objective → … → release gate chains; readiness status; gates | Register | Product owner + QA lead | All |
| — | [templates/](../templates/README.md) | Illustrative Dockerfiles, Compose, Caddyfile, GitHub workflows, Sonar config, draft SQL, k6 script | **Untested** (draft SQL checked on a scratch PostgreSQL 18.4) | DevOps / integrator | K, L, E, M |
| — | [Change summary](../CHANGES_AND_OPEN_DECISIONS.md) | What changed from v0.3 and what is still undecided | Current | Product owner | — |

**Baseline v0.3 documents** are still useful for history and provenance. Where a v0.4 document covers the same topic, v0.4 is authoritative:

| v0.3 file | Superseded by (v0.4) | Still authoritative for |
| --- | --- | --- |
| CONTEXT, START_HERE, README | B, A0 | — |
| SOURCES.md, SOURCE_REQUIREMENTS.md | — | **Yes**: the source register S1–S7 and SRC-* IDs remain authoritative. C-srs files cite them. |
| DECISIONS, OPEN_QUESTIONS, GLOSSARY | A2, A3, A1 | — |
| FUNCTIONAL_REQUIREMENTS, module specs, WORKFLOWS | C-srs, B §7 | — (FR IDs preserved) |
| ARCHITECTURE, STACK, TENANCY, SYSTEM_DESIGN_TEMPLATE, API_CONTRACTS | D, D1, ADRs | — |
| DATA, DATA_DICTIONARY, DATABASE_DESIGN_TEMPLATE | E | — |
| DESIGN | F | — |
| AGENTS.md, CLAUDE.md, AGENT_DEVELOPMENT, templates/TASK.md | G (extends them) | **AGENTS.md rules remain in force** for coding agents until the repository's own AGENTS.md is created from G §5. |
| TESTING_CI, NFR, OPERATIONS, READINESS, TRACEABILITY, RISK_REGISTER, ROADMAP, PRD, SAAS_PLATFORM, ACCESS_CONTROL, CLINICAL_SAFETY, FINANCIAL_RULES, INTEGRATIONS, BANGLADESH_LAUNCH_DISCOVERY, PLANNING_PROCESS | H, I, C15, J, N, B, C01, C04, C14 | RISK_REGISTER R-01..R-11 IDs are kept and referenced from N. |

## 4. Identifier conventions

| Prefix | Meaning | Defined in |
| --- | --- | --- |
| `C-`, `P-`, `DEF-` | Confirmed decision, proposal, deferred item | A2 |
| `Q-` | Open question | A3 |
| `AS-`, `CX-` | Assumption, contradiction | A4 |
| `S1`–`S7`, `SRC-*` | Supplied source document, source requirement | baseline SOURCES / SOURCE_REQUIREMENTS |
| `BO-`, `BW-`, `SM-`, `BAC-`, `RP-` | Business objective, business workflow, success measure, business acceptance criterion, release proposal | B |
| `FR-<MOD>-nnn` | Functional requirement. v0.3 IDs are preserved; new IDs continue the numbering. | C-srs |
| `NFR-<AREA>-nnn` | Non-functional requirement | C15 |
| `UC-<MOD>-nn` | Use case (detailed flow) | C-srs |
| `ADR-nnn` | Architecture decision record | D2 |
| `EP-nn`, `T-<AREA>-nn` | Epic, implementation task | G |
| `AT-<AREA>-nnn` | Automated test case | H |
| `UAT-<DEPT>-nnn` | Manual / UAT case | I |
| `RB-nn` | Operations runbook | J |
| `RG-n` | Release gate | N |
| `R-nn` | Risk (v0.3 register, extended in N) | N |

IDs are never reused or renumbered. A retired requirement is marked "Withdrawn" with a reason, not deleted.

## 5. Document control and maintenance

- **Version scheme:** `MAJOR.MINOR.PATCH-status`. This set is `0.4.0-draft`. A document becomes `1.0.0` when its owner role approves it. A change to an approved document bumps MINOR and records the change in [CHANGES_AND_OPEN_DECISIONS.md](../CHANGES_AND_OPEN_DECISIONS.md).
- **Single source of truth:**
  - decisions → A2
  - questions → A3
  - requirements → C-srs
  - schema → E (then the real Prisma schema and migrations once they exist)
  - contracts → `packages/contracts` once it exists (D §8)
  - Other documents link. They do not copy.
- **When code exists**, the repository becomes authoritative for implemented behavior. The documents must then be updated in the same pull request as behavior changes ([G §7](G-implementation-plan.md#7-review-responsibilities-and-handoff)).
- **Link check:** every relative link in this pack was checked when it was packaged (see the change summary). Re-run the check after edits.

## 6. What "done" means for this documentation set

| Gate | Criterion | State at v0.4 |
| --- | --- | --- |
| Reviewable | Every required section A–N exists, with status labels | Met |
| Approved for scaffolding | RG-0 criteria in [N §5](N-traceability-readiness.md#5-release-gates) | **Not met.** Needs approval of P-001, P-003, P-007..P-010, P-016, P-017, P-021 and the scaffold spike plan. |
| Approved for the first workflow slice | Q-003, Q-004 (or exclusion), Q-020, Q-022, Q-024, Q-034, Q-035, Q-037, Q-038, Q-039, Q-046, Q-050, Q-051 answered | **Not met** |
| Approved for production | RG-4 | **Not met** (no software yet) |
