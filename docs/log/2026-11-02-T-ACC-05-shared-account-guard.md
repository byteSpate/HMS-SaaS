# T-ACC-05 follow-up: administrators cannot change an account shared with another hospital

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-ACC-05 and T-ACC-03 follow-up; FR-ACC-007, FR-ACC-004; C-094, ADR-003

## What was built

An account has one password, one second factor and one lock across every hospital it belongs to. A hospital administrator could reset the password of a user who also belonged to another hospital, then sign in as that user and choose the other hospital. Password reset, second factor reset, lock and unlock now answer `403 PERMISSION_DENIED` when the account has a membership elsewhere that is not revoked, and change nothing.

No route could create such an account yet, because creating a user refuses an existing username. Tenant provisioning would have opened the path.

## Files

| File                                                                                | Purpose                                                          |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/database/prisma/migrations/20261102090000_shared_account_guard`           | `hms.user_belongs_elsewhere()` and its read-only migrator policy |
| `packages/mod-identity-access/src/infrastructure/shared-account.ts`                 | `assertAccountNotShared()`                                       |
| `packages/mod-identity-access/src/infrastructure/user-admin.repository.ts`          | Guard on password and second factor resets                       |
| `packages/mod-identity-access/src/infrastructure/account-lock.repository.ts`        | Guard on lock and unlock                                         |
| `apps/api/src/user-admin.api.spec.ts`, `packages/database/src/identity.int.test.ts` | Tests                                                            |

## Decisions applied

- **Refuse rather than allow:** no decision says who may change a shared account, so the safe answer is nobody but its owner. The owner can still change their own password. This needs an owner decision before shared accounts are offered.
- **A function, not wider RLS:** the app still cannot read another hospital's memberships. It gets only a yes or no.
- **Fails closed:** with no current hospital the function answers yes, so a missing context refuses the change.

## Verification

| Command                                                                     | Result                               |
| --------------------------------------------------------------------------- | ------------------------------------ |
| New API tests against the code before the fix                               | 3 failed with `200` instead of `403` |
| `vitest run src/user-admin.api.spec.ts src/account-lock.api.spec.ts`, after | 28 of 28 passed                      |
| Full suite                                                                  | In the pull request's CI run         |

## Known limitations

- **Refused attempts are not audited yet:** the audit row would roll back with the transaction. Denied-attempt audit belongs to T-PLT-02.
- **Usernames are unique across all hospitals:** `USERNAME_TAKEN` tells an administrator a name exists elsewhere, and two hospitals cannot both have the same username. Provisioning should settle this.
- **Login diagnostics are not per hospital:** an administrator viewing a shared account's recent logins also sees its logins elsewhere.
- **A shared account with a temporary lock** waits for the lock to expire, because no administrator can unlock it.

Deploy impact: migration `20261102090000_shared_account_guard` (additive, safe while the previous version runs; it must run as `hms_migrator`).

## How to debug

A `403` on one of these routes for a user the administrator can see means the account has a membership elsewhere. The answer comes from `hms.user_belongs_elsewhere()`; `hms_app` cannot list the other hospital's rows, so inspect them as a database administrator.
