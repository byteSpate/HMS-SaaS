# T-ACC-06 follow-up: remove the hospital choice

- **Date:** 2026-11-04
- **Commit:** this commit (feature branch `feat/PAT-patient-registry`)
- **Implements:** the clean-up owed by T-ACC-06 (`2026-11-02-T-ACC-06-per-hospital-accounts.md`); C-099, C-095

## What was built

Since T-ACC-06 an account belongs to one hospital and sign-in names it, so there is nothing left to choose. Removed: `POST /api/v1/auth/session/membership` and `AuthService.selectMembership`; the contract `selectMembershipRequestSchema`; the staff app's choose-hospital screen, its API call and session action, and the "Switch hospital" menu item; the `chooseHospital.*` and `shell.switchHospital` texts. Sign-in now binds the session to the account's hospital directly. A session without a hospital, which should no longer occur, is sent back to the login screen. The public site still redirects an old `/choose-hospital` bookmark, now to `/staff`.

## Files

| File                                                                                                                                               | Purpose                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `packages/mod-identity-access/src/http/auth.controller.ts`, `application/auth.service.ts`                                                          | Route and method removed; login binds directly    |
| `packages/contracts/src/auth.ts`                                                                                                                   | Request schema removed                            |
| `packages/mod-identity-access/src/application/auth.service.spec.ts`, `mfa.service.spec.ts`                                                         | Rotation tests moved onto the remaining rotations |
| `apps/web/app/choose-hospital/page.tsx`                                                                                                            | Deleted                                           |
| `apps/web/src/api/auth.ts`, `session/use-session.ts`, `session/use-access.ts`, `.test.ts`, `components/login-form.tsx`, `components/user-menu.tsx` | Flow removed; redirect to login                   |
| `apps/web/e2e/auth-shell.spec.ts`, `e2e/support/mock-api.ts`                                                                                       | Two-hospital test and mock removed                |
| `packages/i18n/src/messages/en.ts`, `bn-BD.ts`                                                                                                     | Unused texts removed                              |
| `apps/site/next.config.ts`, `apps/site/e2e/seo.spec.ts`                                                                                            | Old bookmark redirects to `/staff`                |

## Decisions applied

- **`TENANT_NOT_SELECTED` and the guards stay,** although the T-ACC-06 entry listed them for removal: they cost nothing and keep a session without a hospital refused (fail closed). `@AllowWithoutTenant` stays for the sign-in, MFA and password routes that run before the session matters.
- **Rotation is still tested:** the tests that used a hospital switch to rotate the session (old token dies, absolute expiry kept, two at once make one session, none after logout) now rotate through the step-up after the second factor; "the second factor survives a rotation" uses the password change.
- **`user_account.tenant_id` stays nullable** until a later release, as planned.

## Verification

| Command                                                  | Result                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm turbo run lint typecheck`                          | 41 of 41, after regenerating Next route types (`next typegen`) |
| `pnpm boundaries:check`                                  | No violations                                                  |
| `turbo run test` for identity, api, web, contracts; i18n | 81, 136, 29, 15; 29, all passing                               |
| Web and site e2e suites                                  | Not run locally (memory); CI runs them on the PR               |

## Known limitations

- **An account with no active membership** cannot sign in (`MEMBERSHIP_NOT_ACTIVE`), as before; there is no screen for it beyond the login message.
- **The `memberships` list stays in the session response,** with one entry; removing it is a contract change for a later release.

Deploy impact: removes the route `POST /api/v1/auth/session/membership`; the web and API must be deployed together (the old web would still call it). No migration, no variable.

## How to debug

A user sent back to login right after signing in: the session came back without `activeMembershipId`; check the account's membership status and `hms.user_account.tenant_id`.
