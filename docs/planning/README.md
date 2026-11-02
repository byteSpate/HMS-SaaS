# Hospital ERP SaaS — documentation set v0.4

**Version 0.4.0-draft · prepared 2026-10-12 · status: for review**

This pack turns the v0.3 planning kit into a full documentation set for building a **whole-hospital ERP sold as SaaS** to multiple hospitals, starting in Bangladesh. AI coding agents will do most of the implementation. The product itself has no autonomous clinical AI (C-027).

It contains documents A–N:
- business requirements
- software requirements by module
- system and database design with decision records
- UI/UX guidance
- an implementation plan for coding agents
- automated and manual test plans
- VPS operations, Docker and CI/CD design
- capacity planning
- traceability

It also contains illustrative configuration templates. The original v0.3 kit is kept unchanged under `baseline/`.

## Start here

| You are… | Open first |
| --- | --- |
| Product owner / hospital stakeholder | [docs/A0 Documentation guide](docs/A0-documentation-guide.md) → [A2 Decisions](docs/A2-decision-register.md) → [A3 Open questions](docs/A3-open-questions.md) → [B BRD](docs/B-business-requirements.md) |
| Developer / tech lead | [D System design](docs/D-system-design.md) → [D1 Stack](docs/D1-stack-assessment-and-versions.md) → [E Database](docs/E-database-design.md) → [G Implementation plan](docs/G-implementation-plan.md) |
| Coding agent | [G §5 Context packet](docs/G-implementation-plan.md#5-context-packet-for-each-agent-task) and only the files your task lists. The baseline [AGENTS.md](baseline/hospital-saas-planning-kit-v0.3/AGENTS.md) rules still apply. |
| QA / DevOps | [H](docs/H-automated-test-plan.md), [I](docs/I-manual-test-uat-plan.md), [J](docs/J-vps-deployment-operations.md), [K](docs/K-docker-design.md), [L](docs/L-cicd-sonarqube.md), [M](docs/M-capacity-performance.md) |

What changed since v0.3, and which decisions are still open: **[CHANGES_AND_OPEN_DECISIONS.md](CHANGES_AND_OPEN_DECISIONS.md)**.

## Folder layout

```text
README.md                         this file
CHANGES_AND_OPEN_DECISIONS.md     short summary of changes and unresolved decisions
docs/
  A0-documentation-guide.md       reading order, index, owners, conventions
  A1-glossary.md                  terminology (+ proposed Bangla labels)
  A2-decision-register.md         CONFIRMED / PROPOSED / DEFERRED decisions (authoritative)
  A3-open-questions.md            every open question with interim handling (authoritative)
  A4-assumptions-and-contradictions.md
  B-business-requirements.md      BRD
  C-srs/                          SRS: C00 overview + C01–C14 modules + C15 NFRs
  D-system-design.md              architecture and cross-cutting design
  D1-stack-assessment-and-versions.md
  D2-adr/                         17 architecture decision records
  E-database-design.md            data model, PostgreSQL design, RLS, Prisma mapping
  F-ui-ux-design.md               navigation, flows, states, print layouts, wireframes
  G-implementation-plan.md        phases, tasks, DoR/DoD, agent workflow
  H-automated-test-plan.md        test layers and catalogue
  I-manual-test-uat-plan.md       department UAT, devices, downtime drills
  J-vps-deployment-operations.md  topology, backups, releases, runbooks
  K-docker-design.md              images, Compose, secrets, env inventory
  L-cicd-sonarqube.md             GitHub Actions, SonarQube Community, scanning, deploys
  M-capacity-performance.md       user scenarios, load model, load tests, triggers
  N-traceability-readiness.md     objective → … → gate chains, readiness, risks
templates/                        illustrative configs (untested except where stated)
baseline/hospital-saas-planning-kit-v0.3/   original input pack, unchanged
```

## Ground rules this pack follows

1. Confirmed decisions are preserved. Everything carries a status label: CONFIRMED / SOURCE-DERIVED / PROPOSED / OPEN / DEFERRED.
2. Missing clinical, billing, payroll, bed-charge and approval rules are **not invented**. They are listed in A3 with safe interim behavior, usually "not available".
3. Government-specific requirements are deferred (DEF-001). **No legal or compliance claim is made.**
4. No calendar estimates, team sizes or productivity multipliers.
5. No capacity claim. "100,000 users" is an open question (Q-041), modeled in M.
6. One authoritative location per rule. Other documents link to it.
7. Templates and draft SQL are clearly marked. Only what was actually executed is described as checked.
