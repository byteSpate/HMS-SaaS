# Feature log

One entry per completed feature or task, written in the same commit as the code. When something breaks later, start here: find the entry for the area, then follow its "How to debug" and "Known limitations".

## When to write an entry

- Write the entry in the same commit as the work it describes. Never create a branch or open a pull request only for a log entry.
- A summary that spans several features goes in a pull request description, or rides in the next feature pull request. It is not a branch of its own. If no feature branch is open, the entry waits and goes into the next feature commit.

## File naming

`YYYY-MM-DD-<task-id>-<short-slug>.md`, for example `2026-10-13-T-FND-04-tenant-rls.md`. Use the date the feature was finished. If there is no task ID, use a short slug only.

## Template

```markdown
# <Task ID>: <title>

- **Date:** YYYY-MM-DD
- **Commit:** <short sha> (fill in after committing, or "this commit")
- **Implements:** task IDs (T-XXX-NN), requirement IDs (FR-XXX-NNN, NFR-XXX-NNN), decisions (C-NNN, ADR-NNN)

## What was built

Two to five sentences in plain language: what a user or developer can now do.

## Files

| File            | Purpose  |
| --------------- | -------- |
| path/to/file.ts | one line |

## Decisions applied

Rules from A2/ADRs this code enforces, and anything chosen during the work (with the reason).

## Verification

| Command     | Result         |
| ----------- | -------------- |
| `pnpm test` | e.g. 12 passed |

## Known limitations

What is not done, what is stubbed, which open questions (Q-*) are excluded.

## How to debug

Where it can fail, which logs or queries to check, and how to reproduce locally.
```

## Entries

| Date       | Entry                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-13 | [T-FND-01/02/03: monorepo scaffold](2026-10-13-T-FND-01-monorepo-scaffold.md)                                                    |
| 2026-10-13 | [T-FND-04: tenant isolation with RLS](2026-10-13-T-FND-04-tenant-rls.md)                                                         |
| 2026-10-14 | [T-ACC-01: login, sessions and CSRF](2026-10-14-T-ACC-01-login.md)                                                               |
| 2026-10-14 | [Day summary](2026-10-14-day-summary.md)                                                                                         |
| 2026-10-15 | [T-UI-01 (decisions): UI foundation](2026-10-15-T-UI-01-ui-foundation-decisions.md)                                              |
| 2026-10-15 | [T-UI-01 S1: design tokens, themes and fonts](2026-10-15-T-UI-01-tokens.md)                                                      |
| 2026-10-15 | [T-UI-01 S2 to S5: guardrails, hooks, primitives](2026-10-15-T-UI-01-primitives.md)                                              |
| 2026-10-15 | [T-I18N-01 and T-UI-02: catalogs, app shell, sign-in](2026-10-15-T-UI-02-app-shell.md)                                           |
| 2026-10-15 | [API status route and Swagger docs](2026-10-15-api-swagger-docs.md)                                                              |
| 2026-10-15 | [Swagger: dev and production servers in one doc](2026-10-15-swagger-dev-prod-servers.md)                                         |
| 2026-10-15 | [Docs: staging deployment and the development boundary](2026-10-15-docs-staging-deployment-boundary.md)                          |
| 2026-10-18 | [Plan: request pipeline, permission guard, response envelope](2026-10-18-T-PLT-07-request-pipeline-plan.md)                      |
| 2026-10-18 | [CI: fix the Prisma generate race in @hms/database](2026-10-18-ci-prisma-generate-race.md)                                       |
| 2026-10-18 | [CI: cache the generated Prisma client with the database build](2026-10-18-ci-database-generated-cache.md)                       |
| 2026-10-18 | [T-PLT-07 (part 1): API request pipeline middleware](2026-10-18-T-PLT-07-request-pipeline.md)                                    |
| 2026-10-19 | [T-ACC-02: roles, permissions and the route permission guard](2026-10-19-T-ACC-02-permission-guard.md)                           |
| 2026-10-21 | [T-WEB-00: public website planning pack](2026-10-21-T-WEB-00-site-planning.md)                                                   |
| 2026-10-21 | [T-WEB-01: public site scaffold](2026-10-21-T-WEB-01-site-scaffold.md)                                                           |
| 2026-10-21 | [T-WEB-02: shared UI additions](2026-10-21-T-WEB-02-shared-ui.md)                                                                |
| 2026-10-21 | [T-WEB-04: content layer and mock data](2026-10-21-T-WEB-04-content-layer.md)                                                    |
| 2026-10-21 | [T-WEB-05: site shell](2026-10-21-T-WEB-05-site-shell.md)                                                                        |
| 2026-10-21 | [T-WEB-06: home page and section registry](2026-10-21-T-WEB-06-home.md)                                                          |
| 2026-10-21 | [T-WEB-07: find a doctor and doctor profiles](2026-10-21-T-WEB-07-doctors.md)                                                    |
| 2026-10-21 | [T-WEB-08: departments and centres](2026-10-21-T-WEB-08-departments.md)                                                          |
| 2026-10-21 | [T-WEB-09: health packages and test prices](2026-10-21-T-WEB-09-packages-tests.md)                                               |
| 2026-10-21 | [T-WEB-12: information pages](2026-10-21-T-WEB-12-info-pages.md)                                                                 |
| 2026-10-21 | [T-WEB-10: booking wizard (mock)](2026-10-21-T-WEB-10-booking.md)                                                                |
| 2026-10-21 | [T-WEB-11: patient service forms (mock)](2026-10-21-T-WEB-11-patient-services.md)                                                |
| 2026-10-21 | [T-WEB-17: site-wide search](2026-10-21-T-WEB-17-site-search.md)                                                                 |
| 2026-10-21 | [T-WEB-13: search engine signals](2026-10-21-T-WEB-13-seo.md)                                                                    |
| 2026-10-21 | [T-WEB-14: image slots and AI prompt list](2026-10-21-T-WEB-14-image-prompts.md)                                                 |
| 2026-10-21 | [T-WEB-15: WEB-A quality pass](2026-10-21-T-WEB-15-quality-pass.md)                                                              |
| 2026-10-21 | [T-WEB-03: natural Bangla copy](2026-10-21-T-WEB-03-bangla-copy.md)                                                              |
| 2026-10-21 | [T-WEB-03: Bangla heading font](2026-10-21-T-WEB-03-bangla-heading-font.md)                                                      |
| 2026-10-21 | [T-WEB-15: design critique and polish](2026-10-21-T-WEB-15-design-polish.md)                                                     |
| 2026-10-21 | [T-WEB-15: motion layer](2026-10-21-T-WEB-15-motion.md)                                                                          |
| 2026-10-22 | [T-WEB-15: sliders and list motion](2026-10-22-T-WEB-15-sliders-and-list-motion.md)                                              |
| 2026-10-22 | [T-WEB-14: generated images for every slot](2026-10-22-T-WEB-14-generated-images.md)                                             |
| 2026-10-22 | [T-WEB-15: loading states and skeletons](2026-10-22-T-WEB-15-loading-states.md)                                                  |
| 2026-10-22 | [T-WEB-17: header search bar with live results](2026-10-22-T-WEB-17-header-search.md)                                            |
| 2026-10-22 | [T-WEB-15: hero slideshow, scroll reveal and five motion packages](2026-10-22-T-WEB-15-motion-packages.md)                       |
| 2026-10-22 | [T-WEB-15: review fixes (carousel focus, language switch, filters, dates, field alignment)](2026-10-22-T-WEB-15-review-fixes.md) |
| 2026-10-23 | [Docs: noman remote renamed to NOMAN1802/HMS-SaaS](2026-10-23-docs-noman-remote.md)                                              |
| 2026-10-24 | [T-WEB-15: accessibility scans wait for entrance animations](2026-10-24-T-WEB-15-axe-after-entrance.md)                          |
| 2026-10-24 | [T-WEB-18: staff app under /staff, and one local origin for both apps](2026-10-24-T-WEB-18-staff-base-path.md)                   |
| 2026-10-24 | [T-WEB-18: image import types for a fresh checkout](2026-10-24-T-WEB-18-image-types.md)                                          |
| 2026-10-26 | [Docs: one installation per hospital, SaaS planning removed](2026-10-26-docs-single-installation.md)                             |
| 2026-10-28 | [T-ACC-03: account lockout, login rate limit and lock diagnostics](2026-10-28-T-ACC-03-lockout.md)                               |
| 2026-10-28 | [T-ACC-04: TOTP second factor for administrators and finance staff](2026-10-28-T-ACC-04-mfa.md)                                  |
| 2026-10-28 | [T-ACC-05: user, membership and role administration, with temporary passwords](2026-10-28-T-ACC-05-user-admin.md)                |
| 2026-10-28 | [Swagger documentation for the authentication and administration API](2026-10-28-api-swagger-auth.md)                            |
