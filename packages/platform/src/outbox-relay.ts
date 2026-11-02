// Outbox relay (T-PLT-03; ADR-006; AT-JOB-001, -002; D section 9.4). Runs in the worker as hms_relay,
// the one role that reads the outbox across hospitals. It can read the outbox and set two columns,
// and nothing else. FOR UPDATE SKIP LOCKED lets several relays run without sending a row twice.
import type { PrismaClient } from '@hms/database';
import type { JobsOptions } from 'bullmq';

export const OUTBOX_QUEUE = 'outbox-fanout';

/** The part of a BullMQ queue the relay needs. */
export interface OutboxQueue {
  add(name: string, data: unknown, options: JobsOptions): Promise<unknown>;
}

interface OutboxRow {
  id: string;
  tenant_id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  correlation_id: string | null;
}

export interface OutboxJob {
  eventId: string;
  tenantId: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  correlationId: string | null;
}

// D section 10: 10 attempts, exponential from 2 s. Failed jobs stay for inspection.
const JOB_OPTIONS: JobsOptions = {
  attempts: 10,
  backoff: { type: 'exponential', delay: 2_000 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: false,
};

function toJob(row: OutboxRow): OutboxJob {
  return {
    eventId: row.id,
    tenantId: row.tenant_id,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload,
    correlationId: row.correlation_id,
  };
}

/**
 * Sends one batch and returns how many rows it sent. A crash before the commit leaves the rows
 * unpublished. The next run sends them again, and jobId = event ID makes the queue ignore a job it
 * still holds; the inbox covers the rest (AT-JOB-001).
 */
export function publishOutboxBatch(
  relay: PrismaClient,
  queue: OutboxQueue,
  batchSize: number,
): Promise<number> {
  return relay.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, tenant_id, event_type, schema_version, aggregate_type, aggregate_id, payload,
               correlation_id
          FROM hms.outbox_event
         WHERE published_at IS NULL
         ORDER BY occurred_at
         LIMIT ${batchSize}
           FOR UPDATE SKIP LOCKED`;
      for (const row of rows) {
        await queue.add(row.event_type, toJob(row), { ...JOB_OPTIONS, jobId: row.id });
      }
      if (rows.length > 0) {
        await tx.outboxEvent.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { publishedAt: new Date(), attempts: { increment: 1 } },
        });
      }
      return rows.length;
    },
    // Queue calls run inside this transaction, unlike a business command, so it gets longer.
    { maxWait: 5_000, timeout: 30_000 },
  );
}

/** After losing Valkey: sends a time window again. Consumers are idempotent (AT-JOB-002). */
export async function republishOutbox(
  relay: PrismaClient,
  window: { from: Date; to: Date },
): Promise<number> {
  const result = await relay.outboxEvent.updateMany({
    where: { occurredAt: { gte: window.from, lte: window.to }, publishedAt: { not: null } },
    data: { publishedAt: null },
  });
  return result.count;
}
