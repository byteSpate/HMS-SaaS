# T-UI-03: role home dashboards

- **Date:** 2026-11-17
- **Commit:** this commit
- **Implements:** T-UI-03 (role home), F section 2.1 (each role's home), FR-ACC-009 (show only what the server allows), FR-BIL-026, FR-CFG-001, FR-AUD-005; follows the Claude Design "Role Home v2" and "States and Inventory" screens

## What was built

Home is now a role home. It shows one tab for each kind of work the user's permissions allow. A user with only one kind of work sees that view directly, without tabs.

- **Front desk:** sessions today and how many are running, bookings today, and patients waiting to pay with the amount due. Quick links to the front desk, schedules and the cashier desk. Panels for today's doctor sessions (Running, Upcoming, Finished, Draft, Cancelled) and the payment queue.
- **Doctor:** waiting now with the longest wait, in consultation, seen today, and not arrived yet with the number waiting for payment. Today's queue in serial order, with a button to the worklist. It reads the worklist's own polled query (20 seconds, ETag), so Home and the worklist share one cache.
- **Finance:** closed cashier sessions waiting for review and how many show a difference, the total patients owe, the review list and the payment queue.
- **Administration:** setup progress across departments, practitioners, this week's published sessions, doctor fees in force, and staff accounts. Each step links to its screen. Tiles show active users, roles and practitioners, and a panel shows the latest audit events.

A context strip shows the hospital, today's date, when the numbers were last read, and Refresh (which re-reads every list on the page). Every tile is a link to the list behind its number. Tiles and panels have loading, error and empty states. The chosen tab is remembered on the device (`hms.home-view`).

## Files

| File                                                      | Purpose                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| apps/web/app/(app)/page.tsx                               | Home: views from permissions, tabs, context strip; only the chosen view is mounted        |
| apps/web/src/components/home/home-rules.ts (+ test)       | Pure rules: views per permission, session phase, desk and worklist counts, setup progress |
| apps/web/src/components/home/home-parts.tsx               | Tile wired to Next links, tile state from a query, View all link, context strip           |
| apps/web/src/components/home/reception-home.tsx           | Front desk view; exports the cashier queue hook, list and panel for finance               |
| apps/web/src/components/home/doctor-home.tsx              | Doctor view over the polled worklist                                                      |
| apps/web/src/components/home/finance-home.tsx             | Finance view                                                                              |
| apps/web/src/components/home/admin-home.tsx               | Administration view: setup checklist, tiles, recent activity                              |
| packages/ui/src/patterns/KpiTile.tsx                      | Number tile that is a link; ready, loading and error states                               |
| packages/ui/src/patterns/WorkPanel.tsx                    | Panel frame: title, subtitle, action, content                                             |
| packages/ui/src/patterns/EmptyState.tsx, SkeletonRows.tsx | `framed` option, so the states draw no second frame inside a panel                        |
| apps/web/src/components/query-view.tsx                    | `inPanel`: unframed states, shorter skeleton                                              |
| apps/web/src/components/admin/admin-table.ts              | `PANEL_TABLE`: a table without the minimum width, to fit a panel column                   |
| packages/i18n/src/messages/en.ts, bn-BD.ts                | `home.*` texts; unused `home.hospital` removed                                            |
| apps/web/e2e/forgot-password.spec.ts                      | Nav link located with `exact: true`, because a home tile name contains the same word      |

## Decisions applied

- **Permissions decide everything shown (FR-ACC-009).** A view appears when the user holds one of its permissions, and each tile, panel and query is mounted only with the permission its endpoint checks. A partial administrator sees fewer setup steps, and no request is sent that the API would refuse.
- **No new endpoints.** Every number is computed in the browser from lists the API already returns, in `home-rules.ts`, which is unit-tested. Money totals use `sumAmounts` (ADR-007).
- **Tabs mount every panel**, so Home passes content only for the chosen view. Otherwise all four views would read their data at once.
- **Shared caches:** the doctor view uses `WORKLIST_QUERY_KEY` with the worklist's poll, and the admin view's sessions query uses the schedules screen's key for the same week. The audit panel uses its own key, because the audit screen keeps an infinite query under `['audit-events', filters]`.
- **A setup step counts as done** when departments, practitioners or this week's published sessions exist, when a price list is in force, and when at least one active account exists besides the administrator's own.
- **Management maps to finance for now.** The design's management view also needs visit, collection, lab and bed figures, which have no endpoints yet.

## Verification

| Command                                                  | Result                                          |
| -------------------------------------------------------- | ----------------------------------------------- |
| `npx tsc --noEmit`, `npx eslint app src` (apps/web)      | clean                                           |
| `npx vitest run` (apps/web)                              | 90 passed (8 new role home rules)               |
| `npx vitest run` (packages/i18n)                         | 31 passed (every catalog key used)              |
| `CI=1 npx playwright test` (production build, port 3100) | 78 passed (axe and phone-width checks included) |

Screenshots of all four tabs, at desktop and phone width in light and dark, were checked by eye.

## Known limitations

- The management view, the facility selector, per-user hide and reorder of cards ("Edit layout") and the front-desk F2/F3/F4/F6 keys need backend support or a later task, so they are not built.
- Counts come from today's lists, so there are no "yesterday" comparisons yet. That needs a summary endpoint.
- "Last updated" records when Refresh was pressed or the page opened. Background polls on the doctor view do not move it.
- Under `next dev`, axe reports the skip link outside landmarks on every page (the "region" rule). This does not happen on the production build.

## How to debug

- **A tab is missing:** check `HOME_VIEW_PERMISSIONS` in `home-rules.ts` against the session's permission codes.
- **A tile stays in its loading state:** its query is disabled (no permission) or never settled. The tile is mounted only with the permission, so check the request in the network tab.
- **Numbers disagree with a list screen:** the rule is in `home-rules.ts` (for example, draft and cancelled sessions are not counted). Add a unit test for the case.
- **A 403 in the console on Home:** a query is mounted without its permission. Compare the endpoint's `@RequirePermission` with the gate in the view.
