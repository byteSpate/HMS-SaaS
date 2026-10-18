# T-PLT-07 (part 1): API request pipeline middleware

- **Date:** 2026-10-18
- **Commit:** this commit
- **Implements:** T-PLT-07 (part 1 of 2); NFR-OBS-001, FR-AUD-006; ADR-021; D section 8.6 layers 1 to 5

## What was built

Every API request now passes a fixed front half of the request pipeline before the guards:

1. `requestIdMiddleware` gives the request a correlation ID (a safe client `X-Request-Id`, or a new UUID), echoes it in the response header and keeps it on the request.
2. `helmet` adds security headers (HSTS stays with nginx).
3. The JSON body limit is 1 MB; a larger body gets a `413 PAYLOAD_TOO_LARGE` problem instead of a 500.
4. `RequestContextMiddleware` opens an `AsyncLocalStorage` request context; `SessionGuard` adds the tenant, user and membership to it.
5. `nestjs-pino` writes one JSON log line per request (method, path without query, status, duration, correlation, tenant and user IDs), and replaces Nest's default logger.

Problem bodies now carry `correlationId`, and auth events store the request's correlation ID every time (before, an unsafe client ID meant no ID at all).

## Files

| File                                                                  | Purpose                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| packages/platform/src/request-context.ts                              | Request ID rule, AsyncLocalStorage context, `bindRequestIdentity`                         |
| packages/platform/src/request-id.middleware.ts                        | Express middleware: correlation ID on request and response                                |
| packages/platform/src/request-context.middleware.ts                   | Nest middleware: opens the context, keeps it on the request for the log line              |
| packages/platform/src/request-pipeline.module.ts                      | `RequestPipelineModule`: context middleware plus nestjs-pino request logging; `AppLogger` |
| packages/platform/src/problem-details.filter.ts                       | Adds `correlationId`; maps body-parser client errors (413) by status instead of 500       |
| packages/platform/src/request-context.spec.ts                         | Unit tests: ID rules, context across awaits, concurrent requests kept apart               |
| apps/api/src/http/configure-app.ts                                    | Express layer order: request ID, trust proxy, helmet, 1 MB JSON parser, cookies, CORS     |
| apps/api/src/app.module.ts, apps/api/src/main.ts                      | Imports `RequestPipelineModule`; pino replaces Nest's logger (startup logs buffered)      |
| apps/api/src/http/request-pipeline.spec.ts                            | HTTP tests for the whole front half of the pipeline, no database needed                   |
| apps/api/src/auth.api.spec.ts                                         | An unsafe client ID is now replaced (stored ID equals the `X-Request-Id` sent back)       |
| packages/mod-identity-access/src/http/guards.ts                       | `SessionGuard` binds the session to the request context                                   |
| packages/mod-identity-access/src/http/auth.controller.ts              | Uses the pipeline's correlation ID; its own ID regex moved to `platform`                  |
| packages/contracts/src/errors.ts, packages/i18n/src/messages/\*       | New code `PAYLOAD_TOO_LARGE` (413) with English and Bangla messages                       |
| docs/planning/docs/D-system-design.md, G-implementation-plan.md       | D 8.6 layers 1 to 5 corrected to the built order; rate limit marked as part 2             |
| apps/api/package.json, packages/platform/package.json, pnpm-lock.yaml | `helmet` 8.3.0; `nestjs-pino` 5.3.1, `pino` 10.4.0, `pino-http` 11.0.0 (D1 pins)          |

## Decisions applied

- The request ID and the body limit are Express-level, not Nest middleware as D 8.6 first said: Nest registers its body parser before any Nest middleware, so only an Express-level ID reaches a rejected body. D 8.6 was corrected in this change.
- The log line reads the context from the request object, not from AsyncLocalStorage: pino-http writes it on response finish, outside the async context. The same object is in both places, so `bindRequestIdentity` updates both.
- Query strings and headers are never logged (FR-AUD-006): a patient search query can hold names and phone numbers, and headers hold the session cookie and CSRF token.
- `/health` logs at debug level, so proxy and deploy polling does not bury real traffic.
- Body-parser errors are `http-errors` objects (`expose: true`, 4xx status), not `HttpException`; the filter uses only their status, never their message.
- The correlation ID is a random UUID, not UUID v7 as first written in D 8.6: it only needs to be unique, and Node's `crypto.randomUUID` avoids a dependency.
- The 1 MB body limit is the D 8.6 proposal; it is one constant (`JSON_BODY_LIMIT`), not an environment variable.

## Verification

| Command                                                                    | Result                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm turbo run build lint typecheck`                                      | 37 successful, 37 total                                                                                                                                                         |
| `pnpm boundaries:check`                                                    | no dependency violations (247 modules)                                                                                                                                          |
| `pnpm --filter @hms/platform exec vitest run`                              | 17 passed                                                                                                                                                                       |
| `vitest run` in `@hms/contracts`, `@hms/i18n`, `@hms/web`                  | 9, 26 and 18 passed (both catalogs have the new code)                                                                                                                           |
| `pnpm --filter @hms/api exec vitest run src/http/request-pipeline.spec.ts` | 9 passed                                                                                                                                                                        |
| Built API booted with throwaway env, probed with curl                      | `/health` 200 with `X-Request-Id` and helmet headers, no HSTS; `/docs` 200 under the CSP; 404 problem has `correlationId`; one warn log line with path, status, duration and ID |

## Known limitations

- **Part 2 still to do:** the per-session rate-limit guard (`RATE_LIMITED`, 429) needs a Valkey client, which arrives with T-PLT-03.
- The new Bangla message is a proposal until a native speaker reviews it (Q-050).
- Database integration tests (`auth.api.spec.ts` and others) could not run on this machine (no local PostgreSQL); CI runs them.
- The worker will reuse `runWithRequestContext` for job processors when they exist.

## How to debug

- Every response has `X-Request-Id`; every problem body has `correlationId`. Search the logs for that value to find the request line and any error logged with it.
- A request with no log line: check that the module serving the route is under an app that imports `RequestPipelineModule` (the API's `AppModule` does), and that the path is not `/health` (debug level).
- `tenantId` missing from a log line: the route is public or `SessionGuard` did not run; `bindRequestIdentity` is called only after a session resolves.
- A 500 for a client mistake that should be 4xx: check whether the error is an `http-errors` object without `expose: true`, or a new error type the filter does not know.
