# ADR-008 — Bed occupancy as time intervals with exclusion constraints

- **Status:** PROPOSED (P-012)
- **Date:** 2026-10-12
- **Approver:** Tech lead

## Context

- An admission and its bed are separate (C-014). Transfers keep history (C-015).
- Two users racing for the last bed must not both succeed (R-06).
- Future bed-rent rules (Q-007) need exact occupancy intervals.
- Sources report inconsistent occupancy across views (SRC-I03).

## Decision

`bed_occupancy(tenant_id, id, admission_id, bed_id, kind PRIMARY|EXTRA, period tstzrange '[)')` with:
- `EXCLUDE USING gist (tenant_id WITH =, bed_id WITH =, period WITH &&)`: no overlapping occupancy of a bed
- `EXCLUDE USING gist (tenant_id WITH =, admission_id WITH =, period WITH &&) WHERE (kind = 'PRIMARY')`: one primary bed per admission at a time
- an open-ended upper bound for current occupancy (`[start,)`)
- transfer = close + open at the same instant in one transaction

`bed.status` is maintained in the same transaction for fast board queries. A nightly reconciliation compares it with active occupancies.

**Requires:** extension `btree_gist`, added in a SQL migration.

## Alternatives

- **"Current bed" column on admission plus a history table.** Simpler reads, but the constraint against double allocation needs locking discipline everywhere. Preferable only if exclusion constraints prove problematic in operations, which is not expected.
- **Application-level locking only.** Rejected: one missed lock path causes double allocation.

## Consequences

- Interval queries ("who was in bed X at 18:00?") are exact, which is needed for any bed-rent engine.
- Prisma cannot model `tstzrange` or exclusion constraints, so they are written in SQL migrations and accessed through `Unsupported` fields or raw SQL (E §7).

## Evidence required

- AT-IPD-007 and AT-DB-003 concurrency tests.
- The draft DDL was validated on a scratch PostgreSQL 18.4 (E §13).
