# ADR-015 — Worklist refresh by polling with conditional requests

- **Status:** PROPOSED (P-019)
- **Date:** 2026-10-12
- **Approver:** Tech lead

## Context

Worklists (doctor queue, lab stages, cashier queue, bed board, pharmacy requests) must show near-current state. A short delay is acceptable; seconds-level freshness is not a stated requirement. Push infrastructure adds complexity behind Caddy and across replicas.

## Decision

- Worklists poll every 15–30 s (configurable per screen) while visible (`refetchIntervalInBackground: false`). They refetch on window focus and after the user's own mutations.
- The API returns `ETag` per worklist query, derived from a cheap "last change" marker (e.g., max `updated_at` or a per-tenant, per-worklist change counter). It replies `304 Not Modified` when unchanged.
- The polling budget is modeled in [M §4](../M-capacity-performance.md#4-load-model-peak-actions-polling-and-jobs).

## Alternatives

- **Server-Sent Events.** Preferable when measurements show polling cost dominates, or users need sub-second updates. Needs sticky connections or a Redis pub/sub fan-out across API replicas.
- **WebSockets.** More complex; not needed for one-way updates.

## Consequences

- Simple, cache-safe and replica-friendly.
- Staleness up to the interval, mitigated by "Last updated hh:mm:ss" indicators and manual refresh (F §8).

## Evidence required

A load test of the polling mix at the scenario concurrency (M §7).
