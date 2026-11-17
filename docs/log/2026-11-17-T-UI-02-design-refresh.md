# T-UI-02: staff shell and page states from the Claude Design refresh

- **Date:** 2026-11-17
- **Commit:** this commit
- **Implements:** T-UI-02 (shell), F section 2.1 (navigation), F section 5 and 8 (errors, loading, empty), F section 9 (search rules), NFR-ACC-001, ADR-022 sections 2, 4, 9 and 13, C-055 (dark theme switched on)

## What was built

The staff app now follows the "Role Home v2" and "States and Inventory" designs from the Claude Design project "Role-based home redesign" (first of two PRs; the role home dashboards and the cashier invoice and receipt previews come next).

- **Shell.** The sidebar is a teal band with section headings (Front office, Clinical, Finance, Administration). The top bar has one patient search for every screen (focus it with `/`), a keyboard-shortcut list (`?` or the keyboard button), and a light/dark switch. On a phone the top bar shows the logo only, with the search on a second row.
- **Page states on every list screen.** Loading shows rows shaped like the table. A failed load says so in plain words with Try again in place. An empty list says what goes there and what to do next.
- **Stacked rows.** Below 1280 px each table row becomes a short card, and each value carries its column name, so columns no longer squeeze or scroll sideways.
- **Error pages inside the shell.** A screen that crashes shows "This page could not be opened" with Try again and a reference code. An unknown address shows "This page does not exist". If the server cannot be reached, a "No connection" page appears and checks again every 10 seconds.

## Files

| File                                                                                        | Purpose                                                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| packages/ui/src/styles/theme-light.css, theme-dark.css                                      | Sidebar tokens (`--color-sidebar-*`) in both themes; dark theme comment updated for C-055 |
| packages/ui/src/styles/tokens.contrast.test.ts                                              | Contrast pairs for the sidebar tokens                                                     |
| packages/ui/src/styles/index.css                                                            | `stack-table` utility: stacked rows below the desktop tier                                |
| packages/ui/src/layouts/AppShell.tsx (+ test)                                               | Teal sidebar, section headings (`NavItem.group`), `topBarStart` slot, brand-name hiding   |
| packages/ui/src/patterns/EmptyState.tsx                                                     | Empty list or panel: what goes here, the next step, an optional action                    |
| packages/ui/src/patterns/LoadErrorAlert.tsx                                                 | Load failure with Try again in place                                                      |
| packages/ui/src/patterns/SkeletonRows.tsx                                                   | Row-shaped loading placeholder                                                            |
| packages/ui/src/patterns/ErrorPage.tsx (+ test)                                             | Problem / not found / no connection page                                                  |
| packages/ui/src/patterns/ShortcutHelpDialog.tsx (+ test)                                    | Keyboard shortcut list                                                                    |
| packages/ui/src/patterns/list-states.test.tsx                                               | Tests for the three list states                                                           |
| packages/ui/src/primitives/ShortcutKey.tsx                                                  | Accent key chip (`<kbd>`)                                                                 |
| packages/ui/src/utils/theme.ts (+ test)                                                     | Store and apply the theme; the head script that applies it before first paint             |
| packages/ui/src/icons/Icon.tsx, icon-names.ts                                               | `keyboard`, `moon`, `sun`, `wifi-slash`                                                   |
| packages/i18n/src/messages/en.ts, bn-BD.ts                                                  | Nav groups, shell search/theme/shortcuts, `states`, `errorPage`, empty-state hints        |
| apps/web/src/navigation.ts (+ test)                                                         | `groupKey` per item; items reordered so each section is adjacent                          |
| apps/web/src/components/app-frame.tsx                                                       | Wires search, shortcuts, theme switch and section headings into the shell                 |
| apps/web/src/components/patient-search.tsx                                                  | Top-bar patient search (Combobox over the front desk's search API)                        |
| apps/web/src/components/shell-shortcuts.tsx                                                 | `/` and `?` keys and the shortcut dialog                                                  |
| apps/web/src/components/theme-control.tsx                                                   | Light/dark switch                                                                         |
| apps/web/src/components/query-view.tsx                                                      | One component for loading / error / empty / data on every list                            |
| apps/web/src/components/error-pages.tsx                                                     | The three error pages with catalog texts                                                  |
| apps/web/app/(app)/error.tsx, not-found.tsx, [...missing]/page.tsx                          | Error and not-found pages inside the shell; catch-all for unknown staff addresses         |
| apps/web/app/(app)/layout.tsx                                                               | No-connection page with a 10 second recheck; other failures keep their own message        |
| apps/web/app/layout.tsx                                                                     | Head script that applies a stored dark theme before first paint                           |
| apps/web/src/components/brand.tsx                                                           | `data-brand-name` on the name, so the shell can hide it where only the logo fits          |
| apps/web/src/components/admin/admin-table.ts                                                | `stack-table` on every table; `TOOLBAR` class for filter rows                             |
| apps/web/app/(app)/{patients,schedules,cashier-sessions}/page.tsx                           | `QueryView`, column labels, toolbar                                                       |
| apps/web/app/(app)/admin/{departments,practitioners,users,roles,audit,doctor-fees}/page.tsx | `QueryView`, column labels, toolbar                                                       |
| apps/web/src/components/{worklist,doctor-fees,appointments,cashier}/*                       | Same states and labels in the shared tables and lists                                     |

## Decisions applied

- **C-055 changed by the product owner (2026-11-17):** the dark theme ships behind a top-bar toggle. It still applies only through `data-theme="dark"`, never from the system preference (the tokens test still guards this), and the choice is stored per device (`hms.theme` in local storage).
- **Network failure versus other failures (T-ACC-06):** only an `ApiError` with code `NETWORK` shows the "No connection" page. A rate limit or a server error keeps its own message, as before.
- **"No connection" never says the last action failed.** It says we are not sure yet and asks staff not to repeat it, the same rule as an uncertain payment (F section 5).
- **`isLoading`, not `isPending`, drives the skeleton.** A disabled TanStack query (for example a patient search shorter than three letters) stays pending forever, and its placeholder would never go away.
- **Stacked rows are CSS only.** Cells carry `data-label` (column name), `data-cell="actions"` (full line) or `data-cell="inline"` (a short lead token such as the worklist serial, which the name joins). Desktop markup is unchanged.
- **Sidebar colors are their own tokens**, so the rest of the page keeps the white surface. `cx` does not merge Tailwind classes, so overrides on shared controls inside the teal band use the `!` modifier.
- **Navigation order changed:** the worklist now comes after Schedules, so each section's items stay together.
- **Out of scope** (needs backend or is the next PR): role home dashboards and KPI tiles, facility selector, per-user dashboard layout, patient banner, cashier A4 invoice and A5 receipt previews.

## Verification

| Command                                                 | Result                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `npx prettier --check` (changed files)                  | clean (full `pnpm format:check` shows only the Windows CRLF noise) |
| `pnpm turbo run build lint typecheck`                   | 55 of 55 tasks successful                                          |
| `pnpm boundaries:check`                                 | no dependency violations (892 modules)                             |
| `pnpm turbo run test` (with `.env` loaded, services up) | 33 of 33 tasks; ui 203, web 82, i18n 31, api 227 passed            |
| `CI=1 npx playwright test` (production build)           | 78 passed (axe checks and the phone-width overflow check included) |

Screenshots at desktop 1366, tablet 900 and phone 390, in light and dark, were checked by eye.

## Known limitations

- The stacked rows change table display, and some browsers then drop table semantics. The visible column label on each value carries the meaning, and the column heads stay in the accessibility tree.
- `npx playwright test` with `next dev` (the local default) can lose the dev server during the run and fail with `ERR_CONNECTION_REFUSED`. Run `CI=1 npx playwright test` against the production build, as CI does.
- The top-bar search shows patients only. Appointments and other record types are not in the index yet.
- The shortcut list covers the shell keys only. The design's F2/F3/F4/F6 front-desk keys come with the role home.

## How to debug

- **The sidebar shows white instead of teal:** the `--color-sidebar-*` tokens are missing from a theme file, or the web app imports a stale `@hms/ui` build. Run `pnpm turbo run build --filter=@hms/ui`.
- **Dark flashes light on load:** check that the head script in `apps/web/app/layout.tsx` is present and that the CSP still allows inline scripts (`packages/ui/src/security/headers.ts`).
- **A list never leaves its skeleton:** the screen passed a query whose `isLoading` stays true. Check that the query is enabled and that its fetch settles.
- **A table looks squeezed on a tablet:** the table lacks the `TABLE` class from `admin-table.ts`, or a cell is missing its `data-label` or `data-cell`.
- **The no-connection page shows for a real server error:** check `isNetworkError` in `apps/web/app/(app)/layout.tsx`. Only `CLIENT_ERROR_CODES.NETWORK` should reach it.
- **Section headings show twice:** two items of one group are not adjacent in `NAVIGATION`. The navigation test catches this.
