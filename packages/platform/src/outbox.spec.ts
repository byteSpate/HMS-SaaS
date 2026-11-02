import { randomUUID } from 'node:crypto';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { Queue, UnrecoverableError, Worker, type ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMaintenance } from './maintenance.js';
import { appendOutboxEvent, consumeOnce } from './outbox.js';
import { publishOutboxBatch, republishOutbox, type OutboxQueue } from './outbox-relay.js';
import { createValkeyConnection } from './valkey.js';

// Outbox, relay, inbox and jobs against PostgreSQL and Valkey (T-PLT-03; ADR-006; NFR-REL-001/002;
// AT-JOB-001, -002, -005, -006; D sections 9.4 and 10).
const databaseUrl = process.env.DATABASE_URL;
const relayUrl = process.env.RELAY_DATABASE_URL;
const valkeyUrl = process.env.VALKEY_URL;
if (!databaseUrl || !relayUrl || !valkeyUrl) {
  throw new Error('DATABASE_URL, RELAY_DATABASE_URL and VALKEY_URL are required');
}

const event = (tenantId: string, aggregateId = randomUUID()) => ({
  tenantId,
  eventType: 'probe.happened',
  aggregateType: 'probe',
  aggregateId,
  payload: { aggregateId },
});

describe('outbox and jobs', () => {
  let prisma: PrismaClient;
  let relay: PrismaClient;
  let connection: Redis;
  const queues: Queue[] = [];

  const newQueue = () => {
    const queue = new Queue(`test-${randomUUID()}`, {
      connection: connection as ConnectionOptions,
    });
    queues.push(queue);
    return queue;
  };

  async function hospital(): Promise<string> {
    const tenantId = randomUUID();
    await withTenant(prisma, { tenantId }, (tx) =>
      tx.tenant.create({ data: { id: tenantId, code: `test-${tenantId.slice(0, 8)}` } }),
    );
    return tenantId;
  }

  const unpublished = (tenantId: string) =>
    withTenant(prisma, { tenantId }, (tx) =>
      tx.outboxEvent.count({ where: { publishedAt: null } }),
    );

  /** Publishes until this hospital's events are out; other tests' rows may share the batch. */
  async function publishAll(queue: OutboxQueue): Promise<void> {
    while ((await publishOutboxBatch(relay, queue, 100)) > 0);
  }

  beforeAll(() => {
    prisma = createPrismaClient(databaseUrl);
    relay = createPrismaClient(relayUrl);
    connection = createValkeyConnection(valkeyUrl, 'worker');
  });

  afterAll(async () => {
    await Promise.all(queues.map((queue) => queue.obliterate({ force: true })));
    await Promise.all(queues.map((queue) => queue.close()));
    await connection.quit();
    await prisma.$disconnect();
    await relay.$disconnect();
  });

  it('commits an event with its business change, and a rollback leaves none', async () => {
    const tenantId = await hospital();
    await withTenant(prisma, { tenantId }, (tx) => appendOutboxEvent(tx, event(tenantId)));
    expect(await unpublished(tenantId)).toBe(1);
    await expect(
      withTenant(prisma, { tenantId }, async (tx) => {
        await appendOutboxEvent(tx, event(tenantId));
        throw new Error('the command failed');
      }),
    ).rejects.toThrow('the command failed');
    expect(await unpublished(tenantId)).toBe(1);
  });

  it('publishes across hospitals and marks events published', async () => {
    const first = await hospital();
    const second = await hospital();
    await withTenant(prisma, { tenantId: first }, (tx) => appendOutboxEvent(tx, event(first)));
    await withTenant(prisma, { tenantId: second }, (tx) => appendOutboxEvent(tx, event(second)));
    const queue = newQueue();
    await publishAll(queue);
    expect(await unpublished(first)).toBe(0);
    expect(await unpublished(second)).toBe(0);
    const jobs = await queue.getJobs(['waiting']);
    const tenants = jobs.map((job) => (job.data as { tenantId: string }).tenantId);
    expect(tenants).toEqual(expect.arrayContaining([first, second]));
  });

  it('AT-JOB-001: a crash after enqueue, before marking, makes no duplicate job', async () => {
    const tenantId = await hospital();
    await withTenant(prisma, { tenantId }, (tx) => appendOutboxEvent(tx, event(tenantId)));
    const queue = newQueue();
    let crash = true;
    const crashing: OutboxQueue = {
      add: async (name, data, options) => {
        const job = await queue.add(name, data, options);
        if (crash && (data as { tenantId: string }).tenantId === tenantId) {
          throw new Error('crashed before marking');
        }
        return job;
      },
    };
    await expect(publishOutboxBatch(relay, crashing, 100)).rejects.toThrow('crashed');
    expect(await unpublished(tenantId)).toBe(1);

    crash = false;
    await publishAll(crashing);
    expect(await unpublished(tenantId)).toBe(0);
    const mine = (await queue.getJobs(['waiting'])).filter(
      (job) => (job.data as { tenantId: string }).tenantId === tenantId,
    );
    expect(mine).toHaveLength(1);
  });

  it('a duplicate delivery of an event runs its effect once (inbox)', async () => {
    const tenantId = await hospital();
    const eventId = randomUUID();
    let effects = 0;
    const consume = () =>
      consumeOnce(prisma, { tenantId, consumer: 'probe', eventId }, async () => {
        effects += 1;
      });
    await expect(consume()).resolves.toBe(true);
    await expect(consume()).resolves.toBe(false);
    expect(effects).toBe(1);
  });

  it('a failed consumer leaves the event to be retried', async () => {
    const tenantId = await hospital();
    const eventId = randomUUID();
    const input = { tenantId, consumer: 'probe', eventId };
    await expect(
      consumeOnce(prisma, input, async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(consumeOnce(prisma, input, async () => undefined)).resolves.toBe(true);
  });

  it('AT-JOB-002: after losing the queue, republishing delivers again with one effect', async () => {
    const tenantId = await hospital();
    const eventId = randomUUID();
    await withTenant(prisma, { tenantId }, (tx) =>
      tx.outboxEvent.create({ data: { ...event(tenantId), id: eventId } }),
    );
    const from = new Date(Date.now() - 60_000);
    const queue = newQueue();
    await publishAll(queue);
    await consumeOnce(prisma, { tenantId, consumer: 'probe', eventId }, async () => undefined);

    await queue.obliterate({ force: true });
    await republishOutbox(relay, { from, to: new Date(Date.now() + 60_000) });
    expect(await unpublished(tenantId)).toBe(1);
    await publishAll(queue);
    expect(await queue.getJob(eventId)).toBeDefined();
    let effects = 0;
    await consumeOnce(prisma, { tenantId, consumer: 'probe', eventId }, async () => {
      effects += 1;
    });
    expect(effects).toBe(0);
  });

  it('gives the relay role only the outbox, and only its two columns', async () => {
    await expect(relay.tenant.findMany({ take: 1 })).rejects.toThrow();
    await expect(relay.auditEvent.findMany({ take: 1 })).rejects.toThrow();
    await expect(
      relay.outboxEvent.updateMany({ data: { payload: { changed: true } } }),
    ).rejects.toThrow();
  });

  it('gives the app no way to change or read another hospital outbox', async () => {
    const tenantId = await hospital();
    await withTenant(prisma, { tenantId }, (tx) => appendOutboxEvent(tx, event(tenantId)));
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.outboxEvent.updateMany({ data: { publishedAt: new Date() } }),
      ),
    ).rejects.toThrow();
    const other = await hospital();
    await expect(
      withTenant(prisma, { tenantId: other }, (tx) => tx.outboxEvent.count()),
    ).resolves.toBe(0);
  });

  it('AT-JOB-005: a poison job fails once and stays visible', async () => {
    const queue = newQueue();
    let attempts = 0;
    const worker = new Worker(
      queue.name,
      async () => {
        attempts += 1;
        throw new UnrecoverableError('record missing');
      },
      { connection: createValkeyConnection(valkeyUrl, 'worker') as ConnectionOptions },
    );
    const failed = new Promise((resolve) => worker.once('failed', resolve));
    await queue.add('poison', {}, { attempts: 5, removeOnFail: false });
    await failed;
    await worker.close();
    expect(attempts).toBe(1);
    expect(await queue.getFailedCount()).toBe(1);
  });

  it('AT-JOB-006: closing a worker finishes the active job first', async () => {
    const queue = newQueue();
    let finished = false;
    const worker = new Worker(
      queue.name,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        finished = true;
      },
      { connection: createValkeyConnection(valkeyUrl, 'worker') as ConnectionOptions },
    );
    const active = new Promise((resolve) => worker.once('active', resolve));
    await queue.add('slow', {});
    await active;
    await worker.close();
    expect(finished).toBe(true);
    expect(await queue.getCompletedCount()).toBe(1);
  });

  it('maintenance purges expired idempotency records and keeps live ones', async () => {
    const tenantId = await hospital();
    const record = (idemKey: string, expiresAt: Date) => ({
      tenantId,
      actorUserId: randomUUID(),
      idemKey,
      operation: 'probe',
      requestHash: new Uint8Array(32),
      status: 'COMPLETED',
      expiresAt,
    });
    const live = randomUUID();
    const expired = randomUUID();
    await withTenant(prisma, { tenantId }, (tx) =>
      tx.idempotencyRecord.createMany({
        data: [
          record(live, new Date(Date.now() + 60_000)),
          record(expired, new Date(Date.now() - 60_000)),
        ],
      }),
    );
    const result = await runMaintenance(prisma);
    expect(result.idempotencyRecords).toBeGreaterThanOrEqual(1);
    const left = await withTenant(prisma, { tenantId }, (tx) =>
      tx.idempotencyRecord.findMany({ select: { idemKey: true } }),
    );
    expect(left.map((row) => row.idemKey)).toEqual([live]);
  });
});
