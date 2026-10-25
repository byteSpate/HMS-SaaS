# H — Test plan (public website)

| Control    | Value                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Document   | H Automated and manual tests for `apps/site`                                                                                      |
| Version    | 0.1.0-draft                                                                                                                       |
| Status     | Proposal                                                                                                                          |
| Owner role | QA lead                                                                                                                           |
| Updated    | 2026-10-21                                                                                                                        |
| Tools      | Vitest (unit), Playwright + @axe-core/playwright (e2e, accessibility), Lighthouse CI (performance), as already pinned in the repo |

## 1. Test layers

| Layer            | Scope                                                                                                                 | Runs                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Unit (Vitest)    | Content schemas and adapter filters, `localize()`, booking slot generation, form validation, catalog parity and usage | `pnpm test`                                  |
| Static           | ESLint guardrails, typecheck, dependency-cruiser boundaries                                                           | `pnpm lint`, `typecheck`, `boundaries:check` |
| E2E (Playwright) | Route smoke in both languages, key journeys, no-network assertion for forms                                           | `pnpm test:e2e`                              |
| Accessibility    | axe on every route in both languages; keyboard journeys                                                               | inside e2e                                   |
| Performance      | Lighthouse mobile on home, `/doctors`, one profile                                                                    | manual or CI job (PROPOSED)                  |

## 2. Automated cases (WEB-A)

| ID         | Case                                                                                                                                                                                                 | Requirement                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| AT-WEB-001 | `/` redirects to `/bn`; every route in F section 2 returns 200 under `/bn` and `/en`                                                                                                                 | FR-WEB-GEN-001                                       |
| AT-WEB-002 | Site catalogs have the same keys and placeholders; no empty or unused key                                                                                                                            | FR-WEB-GEN-002                                       |
| AT-WEB-003 | Every content JSON file passes its Zod schema; every slug reference resolves                                                                                                                         | P-025, E                                             |
| AT-WEB-004 | Language switch on a detail page keeps the slug and lands in the other locale                                                                                                                        | FR-WEB-GEN-001                                       |
| AT-WEB-005 | Emergency and hotline `tel:` links present on every route                                                                                                                                            | FR-WEB-GEN-005                                       |
| AT-WEB-006 | Response headers include an enforced CSP and the P-029 headers; no `x-powered-by`                                                                                                                    | NFR-WEB-SEC-001                                      |
| AT-WEB-007 | Changing a heading, menu label, footer link or hero image in the mock JSON changes the rendered page with no code change (CMS readiness)                                                             | FR-WEB-GEN-007                                       |
| AT-WEB-008 | Sections render in stored order; a `hidden` section is absent; an unknown section type fails the build                                                                                               | FR-WEB-GEN-008                                       |
| AT-WEB-010 | Directory search by name, by interest and by department returns the expected fictional doctors                                                                                                       | FR-WEB-DOC-001                                       |
| AT-WEB-011 | Filters are written to and restored from the URL query                                                                                                                                               | FR-WEB-DOC-002                                       |
| AT-WEB-012 | Profile shows schedule rows with Bangla digits on `/bn` and Latin on `/en`                                                                                                                           | FR-WEB-DOC-004, FR-WEB-GEN-003                       |
| AT-WEB-013 | Department page lists exactly the doctors whose `department` matches                                                                                                                                 | FR-WEB-DEP-002                                       |
| AT-WEB-014 | Empty search shows the empty state and announces "0 results"                                                                                                                                         | FR-WEB-DOC-001                                       |
| AT-WEB-020 | Package and test prices use lakh grouping and the taka sign, e.g. `৳ 40,700.00` / `৳ ৪০,৭০০.০০`                                                                                                      | FR-WEB-GEN-003                                       |
| AT-WEB-021 | "Sample price" label is shown with every price                                                                                                                                                       | FR-WEB-PKG-003                                       |
| AT-WEB-022 | Test search by code and by name in both languages                                                                                                                                                    | FR-WEB-TST-001                                       |
| AT-WEB-030 | Booking from a doctor profile pre-selects the doctor; times match schedule and `slotMinutes`                                                                                                         | FR-WEB-BOOK-001, -002                                |
| AT-WEB-031 | Booking validation: missing name, invalid phone; Bangla-digit phone accepted                                                                                                                         | FR-WEB-BOOK-003                                      |
| AT-WEB-032 | Booking confirmation shows the demo message; Playwright asserts no request leaves the page origin and no POST is made                                                                                | FR-WEB-BOOK-004, FR-WEB-GEN-006                      |
| AT-WEB-033 | Report lookup, sample collection, feedback and contact forms end in the demo message with no network request                                                                                         | FR-WEB-REP-001, FR-WEB-SVC-001, -002, FR-WEB-INF-002 |
| AT-WEB-034 | Keyboard-only: open and close the mobile menu, complete booking                                                                                                                                      | NFR-WEB-ACC-001                                      |
| AT-WEB-035 | axe: zero violations on every route in both languages                                                                                                                                                | NFR-WEB-ACC-001                                      |
| AT-WEB-040 | Each page has a unique title and description in its language, `hreflang` alternates and canonical                                                                                                    | FR-WEB-SEO-001                                       |
| AT-WEB-041 | `sitemap.xml` lists both locales; `robots.txt` disallows indexing while demo                                                                                                                         | FR-WEB-SEO-002                                       |
| AT-WEB-042 | Unknown path renders the localized not-found page with status 404                                                                                                                                    | FR-WEB-INF-005                                       |
| AT-WEB-050 | A doctor with leave covering "today" (mock clock) shows the leave notice; the booking wizard offers no dates inside the leave                                                                        | FR-WEB-DOC-006                                       |
| AT-WEB-051 | Related doctors: at most four, same department first, never the current doctor                                                                                                                       | FR-WEB-DOC-007                                       |
| AT-WEB-052 | Department page shows OPD sessions per day with locale digits                                                                                                                                        | FR-WEB-DEP-004                                       |
| AT-WEB-053 | Package shows code, separate total, package price and the computed saving; saving = separate total minus package price                                                                               | FR-WEB-PKG-004                                       |
| AT-WEB-054 | `appointmentRequest` section renders on an article, validates, ends in the demo message, sends nothing                                                                                               | FR-WEB-GEN-009                                       |
| AT-WEB-055 | Both hotlines appear in the top bar and contact page with `tel:` links                                                                                                                               | FR-WEB-GEN-010                                       |
| AT-WEB-056 | Branch page lists only that branch's doctors and its units                                                                                                                                           | FR-WEB-INF-007                                       |
| AT-WEB-057 | Guide anchors `#patient-rights`, `#admission-payment`, `#discharge-checklist` exist and are linkable in both languages                                                                               | FR-WEB-SVC-005                                       |
| AT-WEB-058 | Site search "card" / "কার্ড" and a Bangla-digit test code return grouped results for doctors, departments, packages and tests                                                                        | FR-WEB-SRCH-001                                      |
| AT-WEB-060 | Behind the joined host (staging check by the project lead, D section 13.4): `/` serves the site, `/staff` serves the staff app, `/staff/_next/...` assets load; `/login` redirects to `/staff/login` | FR-WEB-ROUTE-001, -002                               |
| AT-WEB-061 | `landingFor()` unit cases: ERP only -> `erp`; website only -> `website`; both -> `choose`; none -> no-access                                                                                         | FR-WEB-ROUTE-003                                     |
| AT-WEB-062 | E2E: a doctor account lands on the ERP home; a website-only account lands on `/staff/website`; an owner account sees `/staff/start` and both choices                                                 | FR-WEB-ROUTE-003                                     |
| AT-WEB-063 | The ERP / Website switch is visible only for users who hold both, and switching keeps the session                                                                                                    | FR-WEB-ROUTE-004                                     |
| AT-WEB-064 | A website-only user opening an ERP URL, and an ERP-only user opening a CMS URL, see "no access"; the matching API call returns 403                                                                   | FR-WEB-ROUTE-005                                     |
| AT-WEB-065 | Site `robots.txt` disallows `/staff`; staff responses carry `X-Robots-Tag: noindex, nofollow`; the site's proxy does not redirect `/staff/login` to `/bn/...`                                        | FR-WEB-ROUTE-006                                     |
| AT-WEB-066 | A website publisher without enrolled two-factor cannot finish login; repeated wrong passwords lock the account (AT-ACC-006..010 reused)                                                              | FR-WEB-ROUTE-007                                     |
| AT-WEB-067 | Staff app responses carry an enforced CSP and `X-Frame-Options: DENY`; a CMS text field containing `<script>` renders as text on the site                                                            | NFR-WEB-SEC-002                                      |

## 3. Manual review (UAT)

| ID          | Scenario                                                                                                                                                      | Who                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| UAT-WEB-001 | Walk the home page and each section against continental.health's structure, in Bangla first, then English; confirm HMS fonts and colors and no copied content | Product owner      |
| UAT-WEB-002 | Phone (360 px) walk-through: find a cardiologist and reach "Book" in three taps or fewer                                                                      | Product owner + QA |
| UAT-WEB-003 | Bangla copy review on all pages (Q-079)                                                                                                                       | Native reviewer    |
| UAT-WEB-004 | Tablet (768) and wide desktop (1920) layout review                                                                                                            | QA                 |
| UAT-WEB-005 | Screen reader pass (NVDA or TalkBack) on home, directory, booking                                                                                             | QA                 |
| UAT-WEB-006 | Demo honesty check: no real names, seals, awards or testimonials; demo notice on every page                                                                   | Product owner      |

## 4. Test data

All data is the fictional mock content (E). No real patient, doctor or hospital data is used, matching `packages/testkit` rules (synthetic data only).

## CMS demo checks (C-091, C-092)

`apps/site/src/cms/demo-store.test.ts` covers draft/publication isolation, reload persistence, restore, stale revisions, corrupt/blocked/full storage, schema validation and 20-version retention. `apps/site/e2e/cms.spec.ts` covers both languages, desktop and phone axe checks, no API requests, draft and published previews, restore and reset, and verifies the public home page is unchanged. The CMS demo is not a production access-control or audit implementation.
