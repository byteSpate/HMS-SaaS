# ADR-003 — Shared-schema tenancy with composite tenant keys and RLS

- **Status:** ACCEPTED by the product owner on 2026-10-14 (P-002 partly settled by C-024; P-003). Evidence items 1–4 recorded below. Superseded by ADR-023 on 2026-10-26, then reinstated on 2026-11-02 (C-094).
- **Date:** 2026-10-12
- **Approver:** Tech lead + product owner

## Context

Multiple hospitals share one product (C-001). Cross-tenant exposure is the worst-case failure (R-03, C-029). VPS hosting favors one database cluster (C-026). Each tenant has one facility initially (C-024).

## Decision

1. Every tenant-owned table has `tenant_id uuid NOT NULL` and `UNIQUE (tenant_id, id)`. Child tables reference parents with **composite foreign keys** `(tenant_id, parent_id) → parent(tenant_id, id)`.
2. **RLS** is enabled **and forced** on every tenant-owned table, with policies on `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`. An unset context matches nothing (fail-closed).
3. The application connects as `hms_app`: not the owner, `NOBYPASSRLS`, DML only, and no `UPDATE`/`DELETE` grants on append-only tables. Migrations run as `hms_owner`.
4. Tenant context is applied **transaction-locally** by `withTenant()`, which opens an interactive Prisma transaction and calls `set_config(..., true)` before any query. Prisma's per-query batch-transaction RLS example is not used, because its own README says it is not production-ready and conflicts with explicit transactions.
5. Repositories also filter by `tenant_id` explicitly. RLS is the second barrier, not the only one.
6. Cache keys, job payloads, object keys, exports and logs carry the tenant (D §6.4).

## Alternatives

| Option | When preferable |
| --- | --- |
| Database per tenant | Contractual isolation or very large tenant (DEF-005) |
| Schema per tenant | Not recommended with Prisma |
| Dedicated deployment | Enterprise placement (DEF-005) |
| Application filtering only (no RLS) | Never as the sole control; acceptable only if RLS proves incompatible, with compensating tests and owner approval |

## Consequences

- **Positive:** defence in depth; one migration path; tenant moves are data copies.
- **Negative:**
  - every request needs a transaction (one extra round trip for `set_config`)
  - per-tenant restore needs a tooling path (E §11)
  - reporting replicas must also enforce RLS or use per-tenant views

## Evidence required (spike T-FND-04)

On PostgreSQL 18 with Prisma 7.10 + `@prisma/adapter-pg`:
1. Concurrent requests for two tenants never see each other's rows.
2. After a transaction error, the next request on the reused connection has no tenant context.
3. A missing context returns zero rows and rejects inserts.
4. A cross-tenant composite foreign key insert fails.
5. `hms_app` cannot `UPDATE` audit rows.

Draft SQL for these was checked on a scratch PostgreSQL 18.4 ([E §13](../E-database-design.md#13-validation-performed-on-the-draft-sql)).

## Evidence recorded (T-FND-04, 2026-10-13)

PostgreSQL 17.11 (ADR-019), Prisma 7.10 + `@prisma/adapter-pg`, as `hms_app`. Tests: `packages/database/src/with-tenant.int.test.ts`. Migration: `20261013112515_tenant_rls`.

| Item | Result |
| --- | --- |
| 1. Concurrent requests (40 interleaved, pool of 4) | Pass: no cross-tenant rows |
| 2. Context after a failed transaction (pool of 1) | Pass: `app.tenant_id` is empty, zero rows visible |
| 3. Missing context | Pass: zero rows; insert rejected by RLS |
| 4. Cross-tenant composite foreign key | Pass: rejected. A wrong-tenant write is also rejected by RLS |
| 5. `hms_app` cannot UPDATE audit rows | Not yet: audit table arrives with T-PLT-02 |
| RLS coverage check (T-DB-02) | Pass. A probe table with `tenant_id` and no RLS made it fail as intended |

All 8 tests passed on local Docker and on Supabase through the **transaction pooler** (port 6543). `withTenant()` waits up to 5 s for a pooled connection (`maxWait`); Prisma's 2 s default was too short for 40 queued transactions over the Bangladesh–Singapore link.
