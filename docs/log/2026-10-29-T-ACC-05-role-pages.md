# T-ACC-05: role permissions on their own page instead of a dialog

- **Date:** 2026-10-29
- **Commit:** this commit
- **Implements:** T-ACC-05; SCR-22; FR-ACC-008; C-045 (owner request 2026-10-29, from manual testing)

## What was built

The role permission editor no longer opens in a dialog; with 61 permissions in a scrolling dialog it was hard to work with. Built with the existing `@hms/ui` pieces and tokens only (`PageLayout`, `Button`, `Checkbox`, `Field`, `Alert`, `buttonClassName`).

| Route                     | Screen                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `/staff/admin/roles`      | Table: role name and code, template, members, permissions, "Edit permissions" link; "New role" link |
| `/staff/admin/roles/[id]` | Role permissions: role card with back link, "x of 61 selected" with select all, one card per module |
| `/staff/admin/roles/new`  | New role: template, code and names in the top card, then the same permission sections               |

Each module card shows its count (`2/2`) and its own Select all / Clear all; permissions sit in a 1 to 4 column grid by screen width. Save is disabled until something changes; after saving the app returns to the list and shows "Saved."

## Files

| File                                                                    | Purpose                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| apps/web/app/(app)/admin/roles/page.tsx                                 | Roles table                                                                        |
| apps/web/app/(app)/admin/roles/[roleId]/page.tsx, new/page.tsx          | The two role pages (loading, error, not found)                                     |
| apps/web/src/components/admin/role-editor.tsx                           | Shared page body: header card, fields for a new role, save and cancel; `useRoles`  |
| apps/web/src/components/admin/permission-sections.tsx                   | Summary bar and module cards with counts and select all                            |
| apps/web/src/components/admin/role-dialog.tsx, permission-checklist.tsx | Removed (replaced by the two files above)                                          |
| packages/i18n/src/messages/en.ts, bn-BD.ts                              | 15 texts for the pages and the table                                               |
| apps/web/e2e/admin.spec.ts, e2e/support/mock-admin.ts                   | New-role test on the page; new edit-page test with axe; mock `PUT .../permissions` |

## Decisions applied

- **FR-ACC-008:** unchanged rules; the API still refuses removing user or role administration from a role the administrator holds, and the page shows that error above the sections.
- **Chosen in this task:**
  - The role is read from the existing list query (no new endpoint); an unknown ID shows "This role was not found in this hospital."
  - Links stay links (`Link` styled with `buttonClassName`), so the pages open in a new tab and work with the browser's back button.
  - The back arrow sits in the role card, not in the `<h1>`, so the page heading keeps a clean accessible name.
  - Each module's Select all button has an accessible name with the module ("Select all in scheduling"), because several buttons share the visible text.
  - Permission names are still the catalogue codes; localized names per permission are not written yet.

## Verification

| Command                                                         | Result                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `vitest run` in `@hms/i18n` / `@hms/web`                        | 29 / 22 passed (catalog parity, no unused keys)                        |
| `tsc --noEmit`, `eslint` in `@hms/web`; `pnpm boundaries:check` | clean; no violations                                                   |
| `playwright test` admin, mfa, auth-shell, staff-path            | 21 passed; "two hospitals" failed once under load, passed alone        |
| Screenshots at 1440 px and 400 px (mock API)                    | Table, permission page and new-role page render; one column on a phone |

## Known limitations

- No warning when leaving the page with unsaved changes.
- Permission names are codes; the new Bangla texts are proposals until reviewed (Q-050).
- On the dev server the first visit to a new route compiles it, which can exceed a 5 s test timeout once; CI uses a production build.

## Deploy impact

None.

## How to debug

- **"Edit permissions" opens a not-found message:** the ID in the URL is not a role of this hospital; `GET /api/v1/admin/roles` lists them.
- **Save stays disabled:** nothing differs from the saved permissions.
- **Save fails with 403:** the change would remove `admin.user.manage` or `admin.role.manage` from a role you hold.
