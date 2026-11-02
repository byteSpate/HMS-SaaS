# T-PLT-01: idempotency

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PLT-01; FPR-08, SP-01, SP-02, SP-08; AT-PLT-001..004; D sections 8.2, 8.6 and 9.3

## What was built

A command route marked `@Idempotent('name')` can now be retried safely. The same `Idempotency-Key` with the same body returns the original answer with `Idempotent-Replay: true` and no second effect. The same key with a different body answers `409 IDEMPOTENCY_KEY_REUSED`. `GET /api/v1/operations/{key}` tells a client whose answer was lost what happened: the finished outcome, or not found, which means a retry is safe.

## Files

| File                                                                           | Purpose                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `packages/database/prisma/migrations/20261102100000_idempotency_record`        | Table, RLS policy and grants                               |
| `packages/database/src/with-tenant.ts`                                         | `withCommandTransaction()`; `withTenant()` joins it        |
| `packages/platform/src/idempotency.ts`                                         | `@Idempotent`, `IdempotencyInterceptor`, `findOperation()` |
| `packages/contracts/src/errors.ts`, `operations.ts`                            | `IDEMPOTENCY_KEY_REUSED`, operation outcome contract       |
| `packages/i18n/src/messages/*`                                                 | Error text in both languages                               |
| `apps/api/src/operations/operations.controller.ts`                             | `GET /operations/{key}`                                    |
| `apps/api/src/idempotency.api.spec.ts`, `packages/testkit/src/staff-client.ts` | Tests; `call()` takes extra headers                        |

## Decisions applied

- **One command, one transaction (D section 9.1):** the interceptor opens the transaction and every `withTenant()` inside the handler joins it, so services need no change. A command transaction refuses a different hospital.
- **A failed command leaves no record:** nothing took effect, so the retry runs normally.
- **Concurrent duplicates wait instead of answering 409:** D section 9.3 expected a `409 STALE_RECORD` while a duplicate is in progress. Because the record commits with the effect, a second request waits on the primary key and then replays the finished answer, which is simpler for the client. D section 9.3 is updated.
- **The route is part of the hash,** so a key cannot be reused on a different command.

## Verification

| Command                                                 | Result                                    |
| ------------------------------------------------------- | ----------------------------------------- |
| `vitest run src/idempotency.api.spec.ts`, before wiring | Failed: `Idempotent is not a function`    |
| Same, after wiring                                      | 8 of 8, including 4 concurrent duplicates |
| Full suite                                              | In the pull request's CI run              |

## Known limitations

- **No route uses it yet:** the first real user is T-PAT-01, and the web client must create the key when the user starts the action (SP-08). Existing admin routes are unchanged.
- **Expired rows are not purged yet:** an expired key is already treated as new (AT-PLT-004), but rows stay until the maintenance job arrives with T-PLT-03.
- **The whole command must fit the 5 second transaction limit,** and a waiting duplicate shares that limit. External work belongs in jobs (D section 9.1).
- **A replay carries the original `meta.correlationId`,** not the retry's. The `X-Request-Id` header still shows the retry's ID.
- **7 day expiry** is the PROPOSED value from D section 9.3.

Deploy impact: migration `20261102100000_idempotency_record` (additive, safe while the previous version runs).

## How to debug

`IDEMPOTENCY_KEY_REUSED` means the client changed the body or route while keeping the key: it must create a new key only when the user starts a new action. A replay that should not happen means the key was reused across intents. As an administrator of the database, read `hms.idempotency_record` by `idem_key`; RLS hides other hospitals from `hms_app`.
