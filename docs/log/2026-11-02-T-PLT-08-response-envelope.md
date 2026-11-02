# T-PLT-08: response envelope

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PLT-08; D sections 8.2 and 8.6 layer 8; ADR-005, NFR-OBS-001

## What was built

Every JSON success from the API now has one shape, `{ data, meta: { correlationId } }`, and a keyset list also carries `meta.nextCursor`. Before wrapping, a global interceptor checks the result against the contract its route declares. A result with a wrong type, an undeclared field or no contract at all is logged and answered as `500 INTERNAL_ERROR`, so a database row or internal field cannot leave by accident. The web client unwraps `data` in one place. Errors stay RFC 9457 problem details and `204` has no body.

## Files

| File                                                                         | Purpose                                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `packages/contracts/src/envelope.ts`                                         | Envelope schemas                                               |
| `packages/platform/src/response-envelope.ts`                                 | `ResponseEnvelopeInterceptor`, `@RawResponse()`, `PagedResult` |
| `packages/platform/src/openapi.ts`                                           | `ApiEndpoint` records the contract and documents the envelope  |
| `packages/platform/src/request-pipeline.module.ts`                           | Registers the interceptor globally                             |
| `apps/web/src/api/client.ts`, `apps/web/e2e/support/mock-api.ts`             | One unwrap point; mocks answer like the real API               |
| `apps/api/src/health/health.controller.ts`, `apps/api/src/app.controller.ts` | `/health` stays raw; the root status route is enveloped        |
| `packages/testkit/src/staff-client.ts`, `apps/api/src/**/*.spec.ts`          | `dataOf()` and specs moved to the envelope                     |

## Decisions applied

- **Undeclared fields fail instead of being stripped:** Zod removes unknown keys silently, so the interceptor compares what the handler sent with what the schema kept. A handler that returns too much is a bug to find, not to hide.
- **No contract means 500:** a route returning JSON must use `ApiEndpoint` with a schema or say `@RawResponse()`, so a forgotten contract cannot leak a row.
- **`/health` stays raw:** nginx, the image smoke test and deploy checks read its plain shape (D section 8.6).
- **Logs hold field paths and rule codes only**, never values, because a value may be patient data (FR-AUD-006).

## Verification

| Command                                         | Result                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| New envelope spec before the code               | Failed: exports missing                                             |
| `vitest run src/http/response-envelope.spec.ts` | Passed, including undeclared fields at the top level and nested     |
| `vitest run` in `apps/api`                      | 67 of 68; `account-lock.api.spec.ts` passed 9 of 9 when rerun alone |
| `vitest run src/api/client.test.ts` in web      | Passed, including a bare body rejected as `INVALID_RESPONSE`        |
| Full suite and web e2e                          | In the pull request's CI run                                        |

## Known limitations

- **Breaking API change:** any client outside this repository must read `data`. The web app and its API move together in this change, so deploy them together.
- **List routes do not exist yet:** `PagedResult` is tested on a probe. Swagger shows `nextCursor` as optional on every response rather than only on lists.
- **`locks after 5 wrong passwords` can hit the 5 second test limit** when the whole API suite runs on a slow machine, because of five Argon2 logins. It passes alone.

Deploy impact: rebuild and deploy `api` and `web` together, because the success body shape changes. No new environment variable or migration.

## How to debug

A `500 INTERNAL_ERROR` on a route that worked before usually means its result no longer matches its contract. Search the logs for `A response broke its contract` with the `correlationId`; `problems` lists each field path and rule, and `route` names the handler. If the web app shows `INVALID_RESPONSE`, check that the answer really has the `{ data, meta }` shape.
