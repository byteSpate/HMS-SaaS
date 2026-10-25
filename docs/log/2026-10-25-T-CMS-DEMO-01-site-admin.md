# T-CMS-DEMO-01: browser-only website demo admin

- **Date:** 2026-10-25
- **Commit:** this commit
- **Implements:** T-CMS-DEMO-01, C-086..C-092; demo portions of FR-CMS-002..004, -009, -010, -013, -016, -017

## What was built

The fictional CareSpate CMS demo lives entirely inside `apps/site`, at `/cms/bn` and `/cms/en`; `/cms` redirects to Bangla. Editors can change bilingual settings, branding, existing images, menus, footer, pages, SEO and ready-made sections. They can add custom demo pages, add/remove/reorder/hide sections, save drafts, preview saved drafts or published demo snapshots, publish demo versions, restore earlier snapshots as drafts and reset the demo.

All state is browser-local under `hms.cms.demo.v1`. No account, API request, real hospital information or ERP/database write is involved. Publishing changes only the local demo, and the public site still renders the committed fictional content. The latest 20 demo publications are retained.

## Rules checked

Read root AGENTS.md, CLAUDE.md, README.md, docs/GIT_WORKFLOW.md, docs/DEPLOYMENT.md, the inherited baseline agent rules, the ERP implementation-plan readiness/done/context requirements, ADR-002, ADR-022, DESIGN.md and the website planning pack. Read apps/site/AGENTS.md and the installed Next.js layout/route/cookies/connection references before framework work; read the installed Turbo README and task/environment guidance before running tasks. Owner instructions C-091 and C-092 override the earlier staff-app CMS location and production-backend scope.

The implementation reuses shared contracts, UI components, AppShell/PageLayout, the public renderer and bilingual catalogs. No app imports another app. No Server Actions, raw form widgets, new dependencies, secrets or deployment changes were introduced. Work stays on a task branch, with review into dev and pushes to origin, reza and noman.

## Files

| Files                                                       | Purpose                                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| apps/site/app/cms                                           | Independent bilingual demo layout, editor and preview routes                                                         |
| apps/site/src/cms                                           | Browser storage, demo actions, reusable structured fields, section editor, validation recovery, history and branding |
| apps/site/e2e/cms.spec.ts                                   | Six demo browser journeys, including both languages, accessibility and recovery regressions                          |
| apps/site/next.config.ts, proxy.ts                          | Bangla-first CMS redirect, routing exclusion and noindex/private headers                                             |
| apps/site/src/components and src/sections                   | Share public presentation with demo preview; accept draft logo and contact settings                                  |
| packages/contracts/src/cms.ts, website.ts, website-brand.ts | Typed demo snapshots, validated ready-made content and readable branding                                             |
| packages/i18n/src/messages/cms                              | English and Bangla demo labels and actionable validation guidance                                                    |
| docs/site-planning                                          | Owner decisions, demo boundary, architecture, task status, acceptance checks and surface design contract             |

## Decisions applied

- C-086: the same person edits and publishes; the demo has no approval stage.
- C-087: ready-made sections, editable branding, two existing font choices and clinical/spacious previews.
- C-088: production prices remain ERP-owned; the demo does not edit or publish real tariffs.
- C-089 and C-090: future installations belong to individual customers and domains, without subscription plan restrictions.
- C-091 and C-092: the UI belongs in apps/site and this delivery is fictional/browser-only.

## Verification

| Check                                                                 | Result                                                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository build, lint and typecheck                                  | 40 tasks passed                                                                                                                                                   |
| Repository unit/integration tests with local .env.example environment | 23 tasks passed, 416 tests; synthetic fixtures only                                                                                                               |
| Focused contracts, i18n and site unit tests after review fixes        | 82 tests passed                                                                                                                                                   |
| Site production build after review fixes                              | Passed                                                                                                                                                            |
| Site lint and typecheck after review fixes                            | Passed                                                                                                                                                            |
| Package boundaries                                                    | Passed, 523 modules checked                                                                                                                                       |
| Final full site Playwright suite                                      | 107 tests passed, including both review recovery regressions                                                                                                      |
| Formatting and git diff whitespace                                    | Passed                                                                                                                                                            |
| Impeccable detector                                                   | No findings on the changed CMS targets                                                                                                                            |
| Visual review                                                         | Desktop 1366x900 and Bangla phone 360x800 captured; no material layout defect. Both identified recovery issues were fixed and scored resolved in the verdict pass |
| Design documentation check                                            | Existing DESIGN.md preserved; ordinary system extension, no new raster assets or palette tokens                                                                   |

The retention test initially hit its five-second timeout under the concurrent full test load. It now uses a smaller valid snapshot, because history retention depends on version count rather than home-page fixture size. The full suite then passed. Browser tests specifically prove that draft edits do not change published demo snapshots or the public home page, and that CMS actions make no /api/v1 requests.

## Known limitations

This is a demo, not a production CMS. Media uploads, collections editors, a form inbox, production authentication/permissions/auditing and ERP integration remain future work. Images are chosen from existing fictional assets. Preview uses its actual browser viewport; device emulation controls, drag ordering and scheduled publishing are not included. Browser storage is local to an origin and browser profile; clearing it removes the demo history. Bangla wording still needs native-speaker review.

The installed Next.js 16.4.0 emitted a security-upgrade reminder during local development/build. A retry completed the build; dependency upgrades require a separate focused change. DESIGN.md has pre-existing seed placeholders and historical product wording; the design documentation check did not expand this task into a system refresh.

## How to debug

Run the site locally and open `/cms/en` or `/cms/bn`. Use Reset demo to recover from corrupt browser storage. A stale-tab message requires reloading the latest saved draft; copy any unsaved fictional edits first. Storage failures keep edits in the open editor and never report a successful save.

Validation summaries provide translated reasons and links to the exact input. They switch to the relevant editor area/page and open collapsed sections before focusing. Array forms use the original seed template independently of their current contents, so an emptied list can still add an item after navigation or reload.

Local review captures: `/tmp/hms-cms-review/`. Reproduce the two recovery checks with the final tests in apps/site/e2e/cms.spec.ts.

Deploy impact: none. No new environment variables, migrations, services or deployment steps. Nothing was deployed.
