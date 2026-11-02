# ADR-006 — Transactional outbox and inbox, idempotency records, BullMQ delivery

- **Status:** ACCEPTED by the product owner on 2026-10-14 (P-010). Valkey chosen (ADR-020, CX-015).
- **Date:** 2026-10-12
- **Approver:** Tech lead

## Context

- Business changes must never be lost or duplicated (FPR-08, FPR-09).
- Work after a commit (PDFs, reports, notifications, integrations) must happen reliably.
- Redis is not transactional with PostgreSQL. Enqueuing directly after commit can lose jobs if the process dies in between. Enqueuing before commit can run jobs for rolled-back changes.

## Decision

1. Commands write `outbox_event` rows in their transaction. A worker relay publishes them to BullMQ with `jobId = eventId` and marks them published (`FOR UPDATE SKIP LOCKED` batches).
2. Consumers record `(consumer, event_id)` in `inbox_event` in their own transaction for deduplication.
3. State-changing API commands store `idempotency_record` rows in the same transaction, scoped to (tenant, actor, key) with a request hash.
4. BullMQ runs on a Redis-protocol server configured with `noeviction` and AOF. Workers handle SIGTERM gracefully. Processors are idempotent.
5. If Redis loses data, unpublished or republished outbox events are re-enqueued safely.

## Alternatives

| Alternative | When preferable |
| --- | --- |
| **pg-boss** (PostgreSQL-backed jobs) | Minimal infrastructure is the priority. Enqueue can share the business transaction, so no Redis is needed. |
| Direct enqueue after commit | Never for money or clinical events |
| Kafka / RabbitMQ | Multi-service event streaming at a scale far beyond the first VPS |

## Consequences

- **Positive:** exactly-once *effects* through at-least-once delivery plus idempotent consumers; a recoverable queue.
- **Negative:** more tables, plus relay lag (monitored; alert if older than 5 min, PROPOSED).

## Evidence required

Tests:
- AT-JOB-001..006: relay crash recovery, duplicate delivery, Redis flush recovery, stalled-job recovery, graceful shutdown
- AT-BIL-011: payment idempotency
