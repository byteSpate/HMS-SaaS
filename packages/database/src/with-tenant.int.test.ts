import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPrismaClient,
  withCommandTransaction,
  withTenant,
  type PrismaClient,
} from './index.js';

// ADR-003 evidence for task T-FND-04, run as hms_app (NOBYPASSRLS) against a real PostgreSQL.
// Item 5 of the ADR evidence list (hms_app cannot UPDATE audit rows) arrives with the audit
// table in T-PLT-02.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for database integration tests');

interface Seeded {
  tenantId: string;
  facilityId: string;
}

async function seedTenant(prisma: PrismaClient): Promise<Seeded> {
  const tenantId = randomUUID();
  const suffix = tenantId.slice(0, 8);
  return withTenant(prisma, { tenantId }, async (tx) => {
    await tx.tenant.create({ data: { id: tenantId, code: `test-${suffix}`, nameEn: 'Test' } });
    const facility = await tx.facility.create({
      data: { tenantId, code: `F-${suffix}`, nameEn: 'Main' },
    });
    return { tenantId, facilityId: facility.id };
  });
}

describe('tenant isolation (RLS + withTenant)', () => {
  let prisma: PrismaClient;
  let a: Seeded;
  let b: Seeded;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl, { maxConnections: 4 });
    a = await seedTenant(prisma);
    b = await seedTenant(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('shows each tenant only its own rows', async () => {
    const seenByA = await withTenant(prisma, { tenantId: a.tenantId }, (tx) =>
      tx.facility.findMany(),
    );
    expect(seenByA.map((f) => f.id)).toEqual([a.facilityId]);

    const tenantsSeenByB = await withTenant(prisma, { tenantId: b.tenantId }, (tx) =>
      tx.tenant.findMany(),
    );
    expect(tenantsSeenByB.map((t) => t.id)).toEqual([b.tenantId]);
  });

  it('never mixes tenants under concurrent requests on a shared pool', async () => {
    const requests = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? a : b));
    const results = await Promise.all(
      requests.map((t) =>
        withTenant(prisma, { tenantId: t.tenantId }, async (tx) => {
          const rows = await tx.facility.findMany({ select: { tenantId: true } });
          return { expected: t.tenantId, seen: rows.map((r) => r.tenantId) };
        }),
      ),
    );
    for (const { expected, seen } of results) expect(seen).toEqual([expected]);
  });

  it('returns no rows and rejects inserts without a tenant context', async () => {
    expect(await prisma.facility.findMany()).toEqual([]);
    expect(await prisma.tenant.findMany()).toEqual([]);
    await expect(
      prisma.facility.create({ data: { tenantId: a.tenantId, code: `X-${randomUUID()}` } }),
    ).rejects.toThrow(/row-level security/);
  });

  it('clears the context after a failed transaction on a reused connection', async () => {
    const single = createPrismaClient(databaseUrl, { maxConnections: 1 });
    try {
      await expect(
        withTenant(single, { tenantId: a.tenantId }, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      const [setting] = await single.$queryRaw<{ value: string | null }[]>`
        SELECT current_setting('app.tenant_id', true) AS value`;
      expect(setting?.value ?? '').toBe('');
      expect(await single.facility.findMany()).toEqual([]);
    } finally {
      await single.$disconnect();
    }
  });

  it("rejects writing a row into another tenant's data", async () => {
    await expect(
      withTenant(prisma, { tenantId: a.tenantId }, (tx) =>
        tx.facility.create({ data: { tenantId: b.tenantId, code: `X-${randomUUID()}` } }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects a child row that points at another tenant's parent (composite FK)", async () => {
    await expect(
      withTenant(prisma, { tenantId: a.tenantId }, (tx) =>
        tx.department.create({
          data: { tenantId: a.tenantId, facilityId: b.facilityId, code: 'OPD' },
        }),
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('rejects a malformed tenant id before touching the database', async () => {
    await expect(withTenant(prisma, { tenantId: "x' OR 1=1" }, async () => 1)).rejects.toThrow(
      /must be a UUID/,
    );
  });
});

describe('command transaction (T-PLT-01)', () => {
  it('joins withTenant to a command transaction, in the same hospital only', async () => {
    const userId = randomUUID();
    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    const client = createPrismaClient(databaseUrl);
    await withCommandTransaction(client, { tenantId, userId }, async (outer) => {
      await withTenant(client, { tenantId, userId }, async (inner) => {
        expect(inner).toBe(outer);
      });
      await expect(
        withTenant(client, { tenantId: otherTenantId }, async () => undefined),
      ).rejects.toThrow('cannot change hospital');
    });
    await client.$disconnect();
  });
});

describe('RLS coverage (T-DB-02, AT-DB-001)', () => {
  it('has forced RLS and a policy on every hms table with tenant_id, and on tenant', async () => {
    const prisma = createPrismaClient(databaseUrl);
    try {
      const missing = await prisma.$queryRaw<{ table: string }[]>`
        SELECT c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'hms'
        WHERE c.relkind IN ('r', 'p')
          -- Both are read before any hospital context exists: user_session by token hash, and
          -- user_account at sign-in (E section 6.3; C-099).
          AND c.relname NOT IN ('user_session', 'user_account')
          AND (c.relname = 'tenant' OR EXISTS (
                SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped))
          AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity
               OR NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
        ORDER BY 1`;
      expect(missing).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });
});
