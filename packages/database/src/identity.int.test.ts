import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, withTenant, withUserContext, type PrismaClient } from './index.js';

// RLS and grant rules for the identity tables (T-ACC-01, ADR-003, ADR-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for database integration tests');

describe('identity tables', () => {
  let prisma: PrismaClient;
  let tenantId: string;
  let ownerId: string;
  let strangerId: string;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    tenantId = randomUUID();
    const suffix = tenantId.slice(0, 8);
    ownerId = (
      await prisma.userAccount.create({
        data: { username: `owner-${suffix}`, displayName: 'Owner', passwordHash: 'x' },
      })
    ).id;
    strangerId = (
      await prisma.userAccount.create({
        data: { username: `stranger-${suffix}`, displayName: 'Stranger', passwordHash: 'x' },
      })
    ).id;
    await withTenant(prisma, { tenantId }, async (tx) => {
      await tx.tenant.create({
        data: { id: tenantId, code: `test-${suffix}`, nameEn: 'Test Hospital' },
      });
      await tx.membership.create({ data: { tenantId, userId: ownerId } });
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lets a user see their own memberships and hospital name before choosing a hospital', async () => {
    const rows = await withUserContext(prisma, ownerId, (tx) =>
      tx.membership.findMany({ include: { tenant: true } }),
    );
    expect(rows.map((row) => row.tenant.nameEn)).toEqual(['Test Hospital']);
  });

  it("hides other users' memberships and hospitals", async () => {
    const rows = await withUserContext(prisma, strangerId, (tx) => tx.membership.findMany());
    expect(rows).toEqual([]);
    const tenants = await withUserContext(prisma, strangerId, (tx) => tx.tenant.findMany());
    expect(tenants).toEqual([]);
  });

  it('rejects an upper-case username (usernames are stored lower-case)', async () => {
    await expect(
      prisma.userAccount.create({
        data: {
          username: `Upper-${randomUUID().slice(0, 8)}`,
          displayName: 'U',
          passwordHash: 'x',
        },
      }),
    ).rejects.toThrow(/user_account_username_lowercase/);
  });

  it('does not allow the app to update audit events (ADR-003 evidence 5)', async () => {
    const event = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.create({ data: { tenantId, action: 'test.event', outcome: 'SUCCEEDED' } }),
    );
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.auditEvent.update({ where: { id: event.id }, data: { reason: 'changed' } }),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot move another hospital's membership into the current hospital", async () => {
    const otherTenantId = randomUUID();
    await withTenant(prisma, { tenantId: otherTenantId }, async (tx) => {
      await tx.tenant.create({
        data: { id: otherTenantId, code: `test-${otherTenantId.slice(0, 8)}`, nameEn: 'Other' },
      });
      await tx.membership.create({ data: { tenantId: otherTenantId, userId: strangerId } });
    });
    const moved = await withTenant(prisma, { tenantId, userId: strangerId }, (tx) =>
      tx.membership.updateMany({
        where: { userId: strangerId, tenantId: otherTenantId },
        data: { tenantId },
      }),
    );
    expect(moved.count).toBe(0);
  });

  it('does not allow the app to update auth events', async () => {
    const event = await prisma.authEvent.create({
      data: { action: 'auth.login.failed', outcome: 'FAILED', usernameAttempted: 'nobody' },
    });
    await expect(
      prisma.authEvent.update({ where: { id: event.id }, data: { reason: 'changed' } }),
    ).rejects.toThrow(/permission denied/);
  });

  // Column-level UPDATE (E section 6): the app changes only what its features change.
  describe('shared-account guard (C-094)', () => {
    const belongsElsewhere = async (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => {
      const rows = await tx.$queryRaw<{ shared: boolean }[]>`
        SELECT hms.user_belongs_elsewhere(${ownerId}::uuid) AS shared`;
      return rows[0]?.shared;
    };

    it('is false for an account only in the current hospital', async () => {
      await expect(withTenant(prisma, { tenantId }, belongsElsewhere)).resolves.toBe(false);
    });

    it('is true from any other hospital, whose rows stay hidden from the app', async () => {
      const otherTenantId = randomUUID();
      await withTenant(prisma, { tenantId: otherTenantId }, async (tx) => {
        await tx.tenant.create({
          data: { id: otherTenantId, code: `test-${otherTenantId.slice(0, 8)}`, nameEn: 'Other' },
        });
        await expect(belongsElsewhere(tx)).resolves.toBe(true);
        await expect(tx.membership.count({ where: { userId: ownerId } })).resolves.toBe(0);
      });
    });

    it('refuses by default when no hospital is set', async () => {
      await expect(withUserContext(prisma, strangerId, belongsElsewhere)).resolves.toBe(true);
    });
  });

  describe('column grants', () => {
    const farFuture = new Date('2099-01-01T00:00:00Z');

    async function createSession(userId: string): Promise<Uint8Array<ArrayBuffer>> {
      const tokenHash = new Uint8Array(randomBytes(32));
      await prisma.userSession.create({
        data: { tokenHash, userId, idleExpiresAt: farFuture, absoluteExpiresAt: farFuture },
      });
      return tokenHash;
    }

    it.each([
      ['username', { username: 'renamed-by-app' }],
      ['display_name', { displayName: 'Renamed by app' }],
      ['created_at', { createdAt: farFuture }],
    ])('refuses to change user_account.%s', async (_column, data) => {
      await expect(prisma.userAccount.update({ where: { id: ownerId }, data })).rejects.toThrow(
        /permission denied/,
      );
    });

    it('still allows the columns the features change on user_account', async () => {
      const updated = await prisma.userAccount.update({
        where: { id: strangerId },
        data: {
          passwordHash: 'y',
          status: 'LOCKED_ADMIN',
          failedAttempts: 1,
          lockedUntil: farFuture,
          lockReason: 'ADMIN_ACTION',
          lockedAt: farFuture,
          lockNote: 'note',
          lockedByUserId: ownerId,
          mustChangePassword: true,
          passwordChangedAt: farFuture,
          preferredLang: 'en',
          version: { increment: 1 },
        },
      });
      expect(updated.version).toBe(2);
    });

    it.each([
      ['user_id', () => ({ userId: strangerId })],
      ['absolute_expires_at', () => ({ absoluteExpiresAt: new Date('2100-01-01T00:00:00Z') })],
      ['mfa_verified_at', () => ({ mfaVerifiedAt: farFuture })],
      ['created_at', () => ({ createdAt: farFuture })],
    ])('refuses to change user_session.%s', async (_column, data) => {
      const tokenHash = await createSession(ownerId);
      await expect(
        prisma.userSession.update({ where: { tokenHash }, data: data() }),
      ).rejects.toThrow(/permission denied/);
    });

    it('still allows revoking a session and sliding its idle limit', async () => {
      const tokenHash = await createSession(ownerId);
      const updated = await prisma.userSession.update({
        where: { tokenHash },
        data: { lastSeenAt: farFuture, idleExpiresAt: farFuture, revokedAt: farFuture },
      });
      expect(updated.revokedAt).toEqual(farFuture);
    });
  });
});
