# Public hospital website — planning pack v0.1

**Version 0.1.0-draft · prepared 2026-10-21 · status: for review**

This pack plans the **public, patient-facing website** that sits beside the Hospital ERP (`apps/web`). It follows the conventions of the ERP pack in [`../planning`](../planning/README.md): every statement carries a status label, IDs are stable, missing rules are not invented, and each rule has one authoritative location.

The first release (**WEB-A**) is a **frontend-only site with mock data**, laid out like continental.health but built with HMS fonts, colors and components. Each customer gets its own ERP installation and website on its own domain (C-089, superseding the earlier shared SaaS direction), and hospital owners edit everything on it through a built-in CMS (C-072, WEB-B). Later releases add ERP data and transactions (booking, reports, portal).

**Routing:** the public website remains at the root of the site host; ERP stays under `/staff`. The CMS interface now belongs in `apps/site` and the fictional demo opens at `/cms` (`/cms/bn`, `/cms/en`), superseding the earlier `/staff/website` editor location (C-091, C-092). Production API authentication and storage are future work.

Confirmed CMS decisions dated 2026-10-25 are recorded in [A, C-086..C-090](A-decisions-and-questions.md): the same person edits and publishes, ready-made sections, editable branding with selectable themes and curated fonts, ERP prices controlled by finance, and no subscription plan restrictions. The browser-only demo is implemented as T-CMS-DEMO-01; production CMS integration has not started.

## Start here

| You are...               | Open first                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product owner            | [A Decisions and questions](A-decisions-and-questions.md) -> [B Business requirements](B-business-requirements.md) -> [R1 Competitor research](research/R1-competitor-analysis.md) |
| Designer / reviewer      | [F UI/UX design](F-ui-ux-design.md)                                                                                                                                                |
| Developer / coding agent | [D System design](D-system-design.md) -> [E Content model](E-content-model.md) -> [G Implementation plan](G-implementation-plan.md)                                                |
| QA                       | [H Test plan](H-test-plan.md)                                                                                                                                                      |

## Folder layout

```text
README.md                        this file
A-decisions-and-questions.md     decisions (C-/P-), open questions (Q-), assumptions (AS-) for the site
B-business-requirements.md       problem, objectives, scope, release slices, success measures
C-srs.md                         functional (FR-WEB-*) and non-functional (NFR-WEB-*) requirements
C2-cms-requirements.md           website CMS: hospital owners edit everything (FR-CMS-*, EP-32)
D-system-design.md               apps/site architecture, i18n routing, content adapter, security, boundaries
E-content-model.md               mock content entities and fields, mapping to future ERP data
F-ui-ux-design.md                page inventory, wireframes, design-system use, image slots
G-implementation-plan.md         phases, tasks T-WEB-*, DoR/DoD, context packet, traceability
H-test-plan.md                   automated (AT-WEB-*) and manual (UAT-WEB-*) checks
research/R1-competitor-analysis.md   six Bangladeshi hospital sites, passively analyzed
```

## Relationship to the ERP pack

- IDs continue the ERP numbering (C-061, P-023, Q-071, AS-017, EP-31) so they can be merged into [A2](../planning/docs/A2-decision-register.md) and [A3](../planning/docs/A3-open-questions.md) without renumbering once approved. Until then, **this pack is authoritative only for the public website**.
- The patient portal requirements stay in [C13](../planning/docs/C-srs/C13-reporting-printing-portal-b2b.md) (FR-POR-001..003, EP-27, Q-033). This pack references them and does not restate them.
- The ERP design system ([DESIGN.md](../../DESIGN.md), ADR-022, C-055..C-060) applies to the site, with the exceptions proposed in A (P-027).

## Ground rules

1. Status labels: **CONFIRMED** (settled by the product owner in a recorded conversation), **PROPOSED** (recommendation awaiting approval), **OPEN** (agents must not choose an answer), **DEFERRED**, **RESEARCH** (observed on a competitor site; describes their product, not ours).
2. Nothing from competitor sites is copied: no text, images, logos, code or data. Research informs structure and features only.
3. Mock content is fictional and labelled as demo content. No fabricated testimonials, accreditations or claims about a real hospital.
4. No calendar estimates or team sizes.
5. WEB-A makes no backend calls and does not deploy anywhere (CLAUDE.md deployment boundary).
