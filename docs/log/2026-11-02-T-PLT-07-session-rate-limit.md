# T-PLT-07 part 2: per-session rate limit and shared limits

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PLT-07 part 2; NFR-SEC-005; D section 8.6 layer 7

## What was built

Each signed-in session now has an API request limit, answered as `429 RATE_LIMITED` with a `Retry-After` header. Login limits and this new limit are stored in Valkey when `VALKEY_URL` is set, so several API processes count together and a restart no longer resets them.

## Files

| File                                                                | Purpose                                    |
| ------------------------------------------------------------------- | ------------------------------------------ |
| `packages/platform/src/valkey-rate-limiter.ts`, `.spec.ts`          | Shared store, fallback and factory         |
| `packages/mod-identity-access/src/http/session-rate-limit.guard.ts` | The guard                                  |
| `packages/mod-identity-access/src/identity-access.module.ts`        | Wiring, and the store used by login limits |
| `packages/mod-identity-access/src/application/auth.config.ts`       | `API_RATE_LIMIT_PER_MINUTE`                |
| `apps/api/src/session-rate-limit.api.spec.ts`                       | Tests over HTTP                            |

## Decisions applied

- **A Valkey outage does not stop work:** limits fall back to per-process counting and report it once. Care and billing must keep running while a cache is down.
- **`@nestjs/throttler` is not used,** although D section 8.6 names it: the login limiter already had a small interface, and one store now serves both.
- **The limit runs after `PermissionGuard`,** so refused requests do not use up a session's budget. Refusals are already audited.

## Verification

| Command                                         | Result                       |
| ----------------------------------------------- | ---------------------------- |
| New specs before the code                       | Failed: code missing         |
| `vitest run src/valkey-rate-limiter.spec.ts`    | 5 of 5 against Valkey 9      |
| `vitest run src/session-rate-limit.api.spec.ts` | 3 of 3 against PostgreSQL    |
| Full suite                                      | In the pull request's CI run |

## Known limitations

- **The default of 600 requests per minute per session is PROPOSED:** D section 8.6 and the T-PLT-07 plan leave the value to be confirmed. Set it with `API_RATE_LIMIT_PER_MINUTE`.
- **A session limit does not stop many sessions:** nginx rate limits stay with the deployer.
- **The permission cache** named in the T-ACC-02 log was not added. No load test shows a need yet.

Deploy impact: new optional variable `API_RATE_LIMIT_PER_MINUTE` (default 600). The API now connects to `VALKEY_URL` when it is set, and keeps working if Valkey is down.

## How to debug

Unexpected `429`: read `rate:api-session:<token hash>` in Valkey and check `API_RATE_LIMIT_PER_MINUTE`. The log line `Rate limits fell back to this process` means Valkey is unreachable, so limits are per process until it returns.
