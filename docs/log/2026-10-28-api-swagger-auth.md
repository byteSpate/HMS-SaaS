# Swagger documentation for the authentication and administration API

- **Date:** 2026-10-28
- **Commit:** this commit
- **Implements:** API documentation for T-ACC-01..05 (owner request 2026-10-28); D section 8; ADR-004, ADR-021

## What was built

Every endpoint of the identity module now appears in Swagger (`/docs`, raw spec at `/docs-json`) with a tag, summary, description, request body, success response and the problem+json error codes it can return. The request and response schemas are generated from the same Zod contracts the API validates with (`@hms/contracts`), so the documentation cannot drift from the code. The document declares the two browser credentials: the `__Host-hms_session` cookie and the `X-CSRF-Token` header; writes are marked as needing the CSRF header.

| Tag                 | Endpoints                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| auth                | `POST /auth/login`, `GET /auth/session`, `POST /auth/session/membership`, `PATCH /auth/preferences`, `POST /auth/password`, `POST /auth/logout`                    |
| auth: second factor | `POST /auth/mfa/enrolment`, `POST /auth/mfa/enrolment/confirm`, `POST /auth/mfa/verify`                                                                            |
| admin: users        | `GET, POST /admin/users`, `POST /admin/users/{userId}/password`, `/membership`, `/mfa/reset`, `PUT /roles`, `GET, POST /admin/users/{userId}/lock`, `POST /unlock` |
| admin: roles        | `GET, POST /admin/roles`, `PUT /admin/roles/{roleId}/permissions`                                                                                                  |

To try a write in Swagger UI: call `POST /auth/login` from the page (same origin, so the browser stores the cookie), then **Authorize** `csrf` with the returned `csrfToken`.

## Files

| File                                                                      | Purpose                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| packages/platform/src/openapi.ts (+ spec)                                 | `openApiSchema` (Zod to OpenAPI 3.0) and `ApiEndpoint` (summary, body, success, errors, CSRF) |
| packages/mod-identity-access/src/http/\*.controller.ts                    | `ApiTags`, `ApiCookieAuth`, `ApiParam` and one `ApiEndpoint` per route                        |
| packages/mod-identity-access/src/http/admin-request.ts                    | Shared guard error lists for the administration routes                                        |
| apps/api/src/http/swagger.ts                                              | Document builder: servers, cookie and CSRF security schemes, description                      |
| apps/api/src/http/swagger.spec.ts                                         | Fails if any `/api/v1` route lacks a summary, tag, success response or CSRF marking           |
| apps/api/src/main.ts                                                      | Uses the builder                                                                              |
| packages/platform/package.json, packages/mod-identity-access/package.json | `@nestjs/swagger` 12.0.2 (already used by the API)                                            |

## Decisions applied

- Schemas come from the contracts through Zod 4's built-in `z.toJSONSchema` (OpenAPI 3.0 target); no DTO classes are written twice. Request bodies use the input shape, responses the output shape.
- Zod's long ISO date-time regular expression is dropped from the document (`format: date-time` already says it) to keep Swagger readable.
- Errors are documented per HTTP status with the stable codes that status can carry, all with the problem+json schema.
- The coverage test runs over the real `AppModule`, so a future endpoint without documentation fails CI.
- The description no longer says "SaaS" (ADR-023).

## Verification

| Command                                                                     | Result                           |
| --------------------------------------------------------------------------- | -------------------------------- |
| `vitest run src/openapi.spec.ts` in `@hms/platform`                         | 2 passed                         |
| `vitest run src/http/swagger.spec.ts` in `@hms/api`                         | 1 passed (all routes documented) |
| `tsc --noEmit` and `eslint` in `@hms/platform`, identity module, `@hms/api` | clean                            |

## Known limitations

- `/docs` is still public wherever the API runs (noted in the 2026-10-15 Swagger log); it must be gated or switched off before patient data is on the server.
- Only the identity routes and the existing health and status routes exist; new modules document their routes with `ApiEndpoint` (the coverage test enforces it).
- Locally, compiling `AppModule` takes about 5 seconds, so `route-markers.spec.ts` (default 5 s timeout) can time out on a slow machine; CI is fast enough. The Swagger test has a 30 s timeout.

## Deploy impact

None. `/docs` already existed; no env var, migration or service change.

## How to debug

- **An endpoint is missing from Swagger:** the route must be in a controller of a module imported by `AppModule`; `swagger.spec.ts` names any route without documentation.
- **A schema looks wrong:** it is generated from the contract in `@hms/contracts`; fix the contract, not the documentation. `openApiSchema(schema)` shows the generated JSON.
