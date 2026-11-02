// Outbox writer and inbox check (T-PLT-03; ADR-006; NFR-REL-001; D section 9.4). An event commits in
// the same transaction as the business change, so it is published if and only if the change exists.
// Delivery is at least once, so every consumer goes through consumeOnce.
import { withTenant, type Prisma, type PrismaClient, type TenantTx } from '@hms/database';
import { getRequestContext } from './request-context.js';

export interface OutboxEventInput {
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  /** IDs and codes only, as in audit details: payloads reach Valkey and job logs. */
  payload: Prisma.InputJsonObject;
  schemaVersion?: number;
}

export async function appendOutboxEvent(tx: TenantTx, input: OutboxEventInput): Promise<void> {
  const correlationId = getRequestContext()?.correlationId;
  await tx.outboxEvent.create({
    data: { ...input, ...(correlationId ? { correlationId } : {}) },
  });
}

export interface InboxEntry {
  tenantId: string;
  consumer: string;
  eventId: string;
}

/**
 * Runs `effect` once per consumer and event, in one transaction with the inbox row. A duplicate
 * delivery does nothing; a failure rolls the row back, so the job's retry runs the effect again.
 * Returns whether the effect ran.
 */
export function consumeOnce(
  prisma: PrismaClient,
  entry: InboxEntry,
  effect: (tx: TenantTx) => Promise<void>,
): Promise<boolean> {
  return withTenant(prisma, { tenantId: entry.tenantId }, async (tx) => {
    const inserted = await tx.inboxEvent.createMany({ data: [entry], skipDuplicates: true });
    if (inserted.count === 0) return false;
    await effect(tx);
    return true;
  });
}
