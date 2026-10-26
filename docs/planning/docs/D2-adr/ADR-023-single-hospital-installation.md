# ADR-023 - One installation per customer hospital

- **Status:** ACCEPTED by the product owner. C-089 (2026-10-25, site pack A) set the direction; on 2026-10-26 the product owner asked for the shared-hosting and tenancy planning to be removed from the documentation. Supersedes ADR-003.
- **Date:** 2026-10-26
- **Approver:** Product owner

## Context

Each purchasing customer receives its own ERP installation and website on its own domain (C-089). The earlier design served many hospitals from one shared database, which needed a tenant key on every row, row-level security and a tenant context on every request (ADR-003).

## Decision

1. One installation serves one hospital: its own deployment, its own PostgreSQL database and its own domain.
2. A hospital may have several branches. Branch is a normal business column where a record belongs to a branch; it is not an isolation boundary.
3. Tables have no `tenant_id`, no row-level security policies for hospital isolation and no per-request tenant context. Keys and constraints are ordinary single-column keys unless a business rule needs more.
4. Database roles stay separate for least privilege: the application connects as `hms_app` (DML only, no `UPDATE`/`DELETE` on append-only tables), migrations run as `hms_migrator`.
5. Cache keys, job payloads, object keys and logs need no tenant field; one installation owns all of them.

## Alternatives

| Option | When preferable |
| --- | --- |
| Shared database for many hospitals (ADR-003) | Not the product direction (C-089). Any future shared offering is planned separately. |

## Consequences

- **Positive:** simpler schema, queries and tests; a customer's data is physically separate; restore and export are whole-database operations.
- **Negative:**
  - each customer installation is deployed, upgraded and backed up on its own
  - a release must be rolled out to every installation

## Existing code

The repository already contains the ADR-003 implementation, which the documentation no longer describes:

- the `hms.tenant` table and RLS migration (T-FND-04), `withTenant()` in `packages/database` and the RLS coverage check (T-DB-02)
- hospital selection at login, `TenantGuard`, `@AllowWithoutTenant()` and the `TENANT_NOT_SELECTED` error (T-ACC-01)
- module entitlements in `packages/authz` and the `ENTITLEMENT_MISSING` error (T-ACC-02)

Removing them is a separate code task that is not planned yet. Until it lands, new code follows the existing pattern so it keeps working.

## Links

- Site pack [A, C-089](../../../site-planning/A-decisions-and-questions.md)
- [ADR-003](ADR-003-tenancy-rls.md) (superseded)
