# T-FND-04 follow-up: column-level UPDATE on the identity tables

- **Date:** 2026-11-01
- **Commit:** this commit
- **Implements:** T-FND-04 acceptance ("`hms_app` has the E section 6 grants only"); deferred item from the T-ACC-01 security review; ADR-019, ADR-023

## What was built

`hms_app` can now update only the `user_account` and `user_session` columns the features actually change. It can no longer rename an account, edit `created_at`, move a session to another user, extend a session's 12-hour absolute limit or mark a session as having passed MFA. These tables have no row-level security (identity is global), so grants are the only database limit. The T-ACC-01 review deferred this until password change existed; T-ACC-05 added that.

| Table          | `hms_app` may update                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user_account` | `password_hash`, `status`, `failed_attempts`, `locked_until`, `lock_reason`, `locked_at`, `lock_note`, `locked_by_user_id`, `must_change_password`, `password_changed_at`, `preferred_lang`, `version` |
| `user_session` | `last_seen_at`, `idle_expires_at`, `revoked_at`                                                                                                                                                        |

## Files

| File                                                                                    | Purpose                                                       |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| packages/database/prisma/migrations/20261101090000_identity_column_grants/migration.sql | The grants, and why                                           |
| packages/database/src/identity.int.test.ts                                              | Refused and still-allowed columns, as `hms_app` on PostgreSQL |
| docs/log/README.md                                                                      | This entry                                                    |

## Decisions applied

- The list comes from every `userAccount` and `userSession` update in `packages/mod-identity-access`; the existing triggers only set `revoked_at`.
- `display_name` is left out because no feature edits it yet. The feature that does adds its grant.
- `INSERT` and `SELECT` privileges and the `DELETE` on `user_session` are unchanged, so creating accounts and sessions still sets the other columns.

## Verification

| Command                                                                       | Result                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| `vitest run src/identity.int.test.ts -t "column grants"` before the migration | 7 failed (the refusals), 2 passed (the allowed columns) |

The results after the migration are in the pull request and its CI run.

## Known limitations

- Other tables with partly mutable rows get column grants when their feature or review calls for it.
- `hms_app` can still write `tenant_entitlement`. That goes away with the tenant code removal (ADR-023).
- `user_session` still does not enforce in the database that its membership belongs to the same user; that is enforced in code on every request.

## Deploy impact

- Migration `20261101090000_identity_column_grants`: narrows privileges only, no table rewrite and no long lock. Safe with the running version, because that code updates only the granted columns.
- No new env var, service, build step or CORS change.

## How to debug

- **`permission denied for table user_account` or `user_session` after a change:** the code updates a column with no grant. Add the column in a new migration and to `identity.int.test.ts`. PostgreSQL names the table, not the column, in this error.
- **Check the current grants:** `SELECT column_name FROM information_schema.column_privileges WHERE table_schema = 'hms' AND table_name = 'user_account' AND privilege_type = 'UPDATE' AND grantee = 'hms_app';`
