# T-ACC-06: one account per hospital

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-ACC-06; C-099, C-098; C-094, C-095; FR-ACC-001, FR-ACC-012

## What was built

An account now belongs to one hospital, and usernames are unique within a hospital, so two hospitals can each have `rahim`. Sign-in and forgotten-password requests take a hospital code, which the form remembers on that browser. A wrong code gets the same answer as a wrong password. The database refuses to add an account to a second hospital, so the shared-account guard from #42 is removed. A rate-limited session now sees the right message rather than "Cannot reach the server".

## Files

| File                                                                       | Purpose                                  |
| -------------------------------------------------------------------------- | ---------------------------------------- |
| `packages/database/prisma/migrations/20261102150000_per_hospital_accounts` | Column, backfill, trigger, login lookup  |
| `packages/contracts/src/auth.ts`, `user-admin.ts`                          | `hospitalCode` in the requests           |
| `packages/mod-identity-access/src/application/auth.service.ts`             | Login and reset request by hospital      |
| `packages/mod-identity-access/src/infrastructure/*`                        | Lookup, user creation, guard removed     |
| `apps/web/src/components/login-form.tsx`, `forgot-password-form.tsx`       | Hospital code field                      |
| `apps/api/scripts/seed-dev.ts`, `packages/testkit/*`                       | Seed and fixtures                        |
| `apps/api/src/per-hospital-accounts.api.spec.ts`                           | Tests                                    |
| A2, G                                                                      | C-098, C-099, T-ACC-06, T-SAA-01 updated |

## Decisions applied

- **C-099, per-hospital accounts:** isolation is what customers buy, and an administrator's reset can no longer reach another hospital. A doctor at two hospitals has two logins.
- **C-095, hospital code for now:** with two hosts the hospital cannot come from the address yet. When host names are added, the form can fill it in.
- **C-098, Platform Admin:** recorded, and planned in T-SAA-01. Not built here.
- **Expand first:** `tenant_id` stays nullable, so the previous version keeps working during a deploy.

## Verification

| Command                                                    | Result                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `vitest run src/per-hospital-accounts.api.spec.ts`, before | 4 of 7 failed                                                                                                   |
| Same, after                                                | 7 of 7                                                                                                          |
| All suites one at a time                                   | API 108, identity 84, platform 48, i18n 29, database 28, web 26, contracts 15, all passing                      |
| Real API in a browser                                      | Wrong code refused like a wrong password; `DEMO` signs in; the code is remembered; the rate limit message shows |
| Migration on a local database with 1,417 accounts          | Applied; `admin` and `reception` stayed with `demo`; 17 accounts with no membership have no hospital            |
| Mock browser suite                                         | In the pull request's CI run                                                                                    |

## Known limitations

- **The hospital-selection page and `POST /auth/session/membership` remain,** although a person now has one hospital. Removing them, and the `TENANT_NOT_SELECTED` paths, is a separate clean-up.
- **`user_account` has `tenant_id` but no RLS,** like `user_session`: sign-in reads it before any hospital context exists. Code must filter it by hospital itself, and the RLS coverage check lists this exception.
- **`tenant_id` is nullable** until a later release can make it `NOT NULL`. An account with no hospital cannot sign in.
- **Existing accounts in several hospitals keep one:** the migration keeps the active or earliest hospital and revokes the rest. Only demo and test data can be in that state.
- **Staff must know their hospital code** until host names are added. The form remembers it per browser.
- **Platform Admin is not built** (T-SAA-01), so a sole administrator who forgets a password still needs a server operator.

Deploy impact: migration `20261102150000_per_hospital_accounts`, expand-only, safe while the previous version runs. **Sign-in changes for users:** staff need their hospital's code, which is the `code` of `hms.tenant`, so tell them before the release. Deploy `api` and `web` together.

## How to debug

`INVALID_CREDENTIALS` with a correct password usually means the wrong hospital code. Check `hms.user_account.tenant_id` and `hms.tenant.code` as a database administrator. `An account belongs to one hospital` comes from the trigger `membership_keeps_one_hospital`: create a new account for that hospital instead.
