import { randomUUID } from 'node:crypto';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allocateBusinessNumber } from './number-sequence.js';

// Business numbers against PostgreSQL, as hms_app (T-PLT-04; FR-CFG-003; C-033; E section 4).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const MRN = { sequenceKey: 'MRN', pattern: '{PREFIX}-{seq:6}', prefix: 'SMH' };

describe('allocateBusinessNumber', () => {
  let prisma: PrismaClient;

  async function hospital(): Promise<string> {
    const tenantId = randomUUID();
    await withTenant(prisma, { tenantId }, (tx) =>
      tx.tenant.create({ data: { id: tenantId, code: `test-${tenantId.slice(0, 8)}` } }),
    );
    return tenantId;
  }

  const allocate = (tenantId: string) =>
    withTenant(prisma, { tenantId }, (tx) => allocateBusinessNumber(tx, { tenantId, ...MRN }));

  beforeAll(() => {
    // More connections than the default, so the test measures the sequence and not the pool.
    prisma = createPrismaClient(databaseUrl, { maxConnections: 20 });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('starts at 1 and counts up in the configured format (C-033)', async () => {
    const tenantId = await hospital();
    await expect(allocate(tenantId)).resolves.toBe('SMH-000001');
    await expect(allocate(tenantId)).resolves.toBe('SMH-000002');
  });

  it('gives 1,000 parallel allocations no duplicates', { timeout: 60_000 }, async () => {
    const tenantId = await hospital();
    // One worker per pooled connection: starting all 1,000 at once only tests the pool's queue.
    const perWorker = 50;
    const worker = async () => {
      const numbers: string[] = [];
      for (let i = 0; i < perWorker; i += 1) numbers.push(await allocate(tenantId));
      return numbers;
    };
    const numbers = (await Promise.all(Array.from({ length: 20 }, worker))).flat();
    expect(numbers).toHaveLength(1000);
    expect(new Set(numbers).size).toBe(1000);
  });

  it('keeps each hospital and each sequence apart', async () => {
    const first = await hospital();
    const second = await hospital();
    await allocate(first);
    await allocate(first);
    await expect(allocate(second)).resolves.toBe('SMH-000001');
    await expect(
      withTenant(prisma, { tenantId: first }, (tx) =>
        allocateBusinessNumber(tx, { tenantId: first, ...MRN, sequenceKey: 'INVOICE' }),
      ),
    ).resolves.toBe('SMH-000001');
  });

  it('returns the number when the business transaction rolls back', async () => {
    const tenantId = await hospital();
    await allocate(tenantId);
    await expect(
      withTenant(prisma, { tenantId }, async (tx) => {
        await allocateBusinessNumber(tx, { tenantId, ...MRN });
        throw new Error('the command failed');
      }),
    ).rejects.toThrow('the command failed');
    await expect(allocate(tenantId)).resolves.toBe('SMH-000002');
  });

  it('cannot touch another hospital through RLS', async () => {
    const mine = await hospital();
    const other = await hospital();
    await expect(
      withTenant(prisma, { tenantId: mine }, (tx) =>
        allocateBusinessNumber(tx, { tenantId: other, ...MRN }),
      ),
    ).rejects.toThrow();
  });
});
