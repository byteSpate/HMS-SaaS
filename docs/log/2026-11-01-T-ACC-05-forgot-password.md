# T-ACC-05: show password button and forgotten password requests

- **Date:** 2026-11-01
- **Commit:** this commit
- **Implements:** T-ACC-05 follow-up (owner request 2026-11-01); FR-ACC-012 (new), FR-ACC-007, FR-ACC-001; C-093 (new); SCR-01, SCR-22; ADR-004

## What was built

**Show password:** every password field in the staff app (sign-in, change password, and the two administrator dialogs) has an eye button that shows or hides what was typed. It starts hidden.

**Forgot password:** the sign-in page has a "Forgot password?" link to `/staff/forgot-password`. The person enters a username and sees one confirmation, whether or not that username exists. The administrator's Users screen then shows a warning with the number of requests and a badge on the person's row, and the details dialog shows when they asked. The administrator confirms who is asking and sets a temporary password with the existing Manage dialog; the person must replace it at next sign-in. Setting a temporary password, or the person changing their own password, clears the request.

| Method and path                             | Access | Answer                                             |
| ------------------------------------------- | ------ | -------------------------------------------------- |
| `POST /api/v1/auth/password-reset-requests` | Public | Always 202 with no body; 422, 429 or 403 otherwise |

## Files

| File                                                                                                                         | Purpose                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| packages/ui/src/primitives/PasswordInput.tsx (+ test), icons, index.ts                                                       | Reusable field with the eye button; `eye-slash` icon          |
| packages/contracts/src/user-admin.ts                                                                                         | `forgotPasswordRequestSchema`; `passwordResetRequestedAt`     |
| packages/database/prisma/schema.prisma, migrations/20261101100000_password_reset_request                                     | One nullable column and its UPDATE grant                      |
| packages/mod-identity-access/src/application/auth.service.ts, http/auth.controller.ts                                        | The request: rate limit, flag, `auth_event`, the public route |
| packages/mod-identity-access/src/infrastructure/identity.repository.ts, user-admin.repository.ts                             | Set the flag, list it, clear it on either password change     |
| packages/mod-identity-access/src/application/user-admin.service.ts                                                           | The flag in the admin payload                                 |
| packages/i18n/src/messages/en.ts, bn-BD.ts                                                                                   | All new texts in both languages                               |
| apps/web/app/forgot-password/page.tsx, src/components/forgot-password-form.tsx, src/api/auth.ts                              | The request screen                                            |
| apps/web/src/components/login-form.tsx, change-password-form.tsx, admin/user-create-dialog.tsx, admin/user-manage-dialog.tsx | The eye button; the link on sign-in                           |
| apps/web/app/(app)/admin/users/page.tsx, src/components/admin/user-details-dialog.tsx                                        | Warning, badge and time for the administrator                 |
| apps/api/src/user-admin.api.spec.ts                                                                                          | Six API tests over HTTP and PostgreSQL                        |
| apps/web/e2e/forgot-password.spec.ts, e2e/support/mock-api.ts, mock-admin.ts, other specs                                    | Four browser tests; password lookups made exact               |
| docs/planning/docs/A2-decision-register.md, C-srs/C01-platform-access-audit.md                                               | C-093 and FR-ACC-012                                          |

## Decisions applied

- **C-093, by the product owner:** request to the administrator, not email or SMS, because accounts hold no email or mobile and no provider exists.
- **Chosen in this task:**
  - The request is one column, not a table: repeating it changes nothing, so it cannot fill a table, and the first time is kept.
  - It changes no password, lock or session, so someone asking under another person's username cannot harm them. Because anyone can ask under any username, the warning tells the administrator to confirm the person really asked.
  - One answer for every username, to avoid revealing which exist. It shares the login rate limits (10 per account, 200 per IP in 15 minutes) so it cannot test usernames faster than login can. Using it counts against that person's login limit, which an attacker could already exhaust through login itself.
  - Disabled accounts are ignored, with the same answer. Every request writes `auth.password_reset.requested` to `auth_event`.
  - Spell check and auto-capitalize stay off on the password field, or a browser could send a revealed password to a spelling service.
  - The eye button is a normal keyboard-reachable button, so pressing it does not submit the form.

## Verification

| Command                                               | Result                     |
| ----------------------------------------------------- | -------------------------- |
| `vitest run src/user-admin.api.spec.ts` in `@hms/api` | 15 passed (6 new)          |
| `vitest run` in `@hms/ui`                             | 177 passed (5 new)         |
| `vitest run` in `@hms/i18n`                           | 29 passed (catalog parity) |

The browser test, lint and full-suite results are in the pull request and its CI run.

## Known limitations

- If the only administrator forgets their password there is nobody to see the request: a server operator must reset it. Keep a second administrator.
- The administrator is told only on the Users screen; there is no notification. The person should also contact them, which the confirmation says.
- There is no way to dismiss a request without setting a password, so a false request stays until someone sets one or the person changes their password.
- Rate-limit counters are in memory until T-PLT-03.
- The new Bangla texts are proposals until a native speaker reviews them (Q-050).

## Deploy impact

- Migration `20261101100000_password_reset_request`: expand-only (one nullable column, one column grant), no long lock.
- Merge PR #38 (column grants) first: its `REVOKE UPDATE` has an earlier name, so applied later it would also remove this column's grant.
- No new env var, service, build step or CORS change.

## How to debug

- **Did a request arrive:** `SELECT occurred_at, outcome, reason, user_id, username_attempted FROM hms.auth_event WHERE action = 'auth.password_reset.requested' ORDER BY occurred_at DESC LIMIT 20;`
- **Who is waiting:** `SELECT username, password_reset_requested_at FROM hms.user_account WHERE password_reset_requested_at IS NOT NULL;`
- **429 on the request screen:** the login rate limit; wait `Retry-After`, or restart the API locally.
- **A browser test finds two elements for a password label:** the eye button's name also contains the word; use `{ exact: true }` or `input[name="password"]`.
