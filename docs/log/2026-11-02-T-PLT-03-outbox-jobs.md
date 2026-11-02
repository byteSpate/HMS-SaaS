# T-PLT-03: outbox, relay, inbox and background jobs

- **Date:** 2026-11-02
- **Commit:** this commit
- **Implements:** T-PLT-03; ADR-006; NFR-REL-001, NFR-REL-002; AT-JOB-001, -002, -005, -006; AT-PLT-004; D sections 9.4 and 10

## What was built

A command can now record an event in its own transaction with `appendOutboxEvent()`. The worker's relay sends unpublished events to the `outbox-fanout` queue, and consumers use `consumeOnce()` so a repeated delivery does nothing. The worker now runs for real: relay loop, fan-out processor, an hourly cleanup job, and a graceful shutdown that finishes active jobs. Valkey connections and BullMQ 6.3.12 with ioredis 6.0.0 are in place.

## Files

| File                                                                | Purpose                                      |
| ------------------------------------------------------------------- | -------------------------------------------- |
| `packages/database/prisma/migrations/20261102130000_outbox_inbox`   | Tables, RLS, relay grants, cleanup functions |
| `packages/platform/src/outbox.ts`, `outbox-relay.ts`                | Writer, inbox check, relay and republish     |
| `packages/platform/src/valkey.ts`, `maintenance.ts`                 | Connections; cleanup                         |
| `apps/worker/src/job-runtime.ts`, `worker.module.ts`                | The running worker                           |
| `docker/postgres/initdb/10-roles.sql`, `supabase/20-relay-role.sql` | The `hms_relay` role                         |
| `.env.example`, `.github/workflows/ci.yml`, K, `docs/DEPLOYMENT.md` | `RELAY_DATABASE_URL`                         |
| `packages/platform/src/outbox.spec.ts`                              | Tests against PostgreSQL and Valkey          |

## Decisions applied

- **`hms_relay` can only read the outbox and set two columns** (E section 6). It bypasses RLS, so it gets nothing else.
- **The migration works without the role:** creating a `BYPASSRLS` role needs an administrator, so a deploy does not fail on it. Without `RELAY_DATABASE_URL` the worker runs and events wait safely in the outbox.
- **Cleanup goes through fixed functions** that delete expired rows and return a count, because `hms_app` cannot see across hospitals.
- **Retention values are PROPOSED:** idempotency 7 days, outbox 30 days, ended sessions 30 days.

## Verification

| Command                                 | Result                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| `vitest run src/outbox.spec.ts`, before | Failed: code missing                                   |
| Same, after                             | 11 of 11 against PostgreSQL 17 and Valkey 9            |
| Worker started locally and stopped      | Published a real event, ran cleanup, exited on SIGTERM |
| Full suite                              | In the pull request's CI run                           |

## Known limitations

- **No module publishes or consumes events yet,** so `outbox-fanout` only logs. Queues for PDF, reports and notifications arrive with their features.
- **`audit_event` is still not partitioned by month,** although E section 9 plans it. The table is small today, and the change rewrites an append-only table, so it should be its own reviewed change.
- **AT-JOB-003 and AT-JOB-004 wait** for reports and PDF rendering.
- **The failed-job alert metric** is a log line until T-PLT-06.
- **The worker has no health check,** because it serves no HTTP. Docker restarts it only if it exits.
- **Windows Redis on port 6379 is version 3.0.504,** too old for BullMQ. Local job tests used a Valkey container on port 6380 (`VALKEY_URL=redis://localhost:6380/0`).

Deploy impact: migration `20261102130000_outbox_inbox` (additive). Before events can flow: as the database administrator, run `docker/postgres/supabase/20-relay-role.sql`, then set a new secret `RELAY_DATABASE_URL` on the worker. The worker now stays running and needs `DATABASE_URL` and `VALKEY_URL`; the Valkey server must use `noeviction`.

## How to debug

Events not arriving: check `SELECT count(*) FROM hms.outbox_event WHERE published_at IS NULL` as an administrator, and the worker log for `Relay failed` or `RELAY_DATABASE_URL is not set`. After losing Valkey, call `republishOutbox()` for the time window; consumers are safe to repeat. A job failing forever stays in the failed set of its queue.
