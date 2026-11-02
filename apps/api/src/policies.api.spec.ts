import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
} from '@hms/mod-identity-access';
import { DatabaseModule, getEffectivePolicy, RequestPipelineModule } from '@hms/platform';
import {
  dataOf,
  grantPermissions,
  seedMembership,
  seedTenant,
  seedUser,
  staffClient,
  type StaffClient,
  type StaffSession,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PoliciesController } from './config/policies.controller.js';
import { configureApp } from './http/configure-app.js';

// Policy versions over real HTTP against PostgreSQL (T-PLT-05; FR-CFG-002, FR-SAA-005; P-004;
// AT-CFG-001, -003).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date());
const NUMBERING = '/config/policies/numbering';

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'v'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
  ],
  controllers: [PoliciesController],
})
class PolicyTestModule {}

describe('policy versions over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [PolicyTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    client = staffClient(`${await app.getUrl()}/api/v1`, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function hospital() {
    const tenantId = await seedTenant(prisma);
    const admin = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, admin.id);
    await grantPermissions(prisma, tenantId, membership, ['admin.config.publish']);
    return { tenantId, session: await client.sessionOf(admin.username, PASSWORD) };
  }

  const publish = (session: StaffSession, body: unknown, key: string = randomUUID()) =>
    client.call(session, 'POST', `${NUMBERING}/versions`, body, { 'Idempotency-Key': key });

  const effective = (tenantId: string, at: Date) =>
    withTenant(prisma, { tenantId }, (tx) => getEffectivePolicy(tx, 'numbering', at));

  it('publishes for immediate use and numbers the versions', async () => {
    const { tenantId, session } = await hospital();
    const first = await publish(session, { body: { mrnPrefix: 'SMH' }, reason: 'First setup' });
    expect(first.status).toBe(201);
    expect(await dataOf(first)).toMatchObject({ versionNo: 1, body: { mrnPrefix: 'SMH' } });
    const second = await publish(session, { body: { mrnPrefix: 'NEW' }, reason: 'Renamed' });
    expect(await dataOf(second)).toMatchObject({ versionNo: 2 });
    await expect(effective(tenantId, new Date())).resolves.toEqual({ mrnPrefix: 'NEW' });
  });

  it('AT-CFG-001: the old version applies until the effective time, the new one after', async () => {
    const { tenantId, session } = await hospital();
    await publish(session, { body: { mrnPrefix: 'OLD' }, reason: 'First setup' });
    const later = new Date(Date.now() + 3_600_000);
    const res = await publish(session, {
      body: { mrnPrefix: 'NEW' },
      effectiveFrom: later.toISOString(),
      reason: 'Next hour',
    });
    expect(res.status).toBe(201);
    await expect(effective(tenantId, new Date(later.getTime() - 1))).resolves.toEqual({
      mrnPrefix: 'OLD',
    });
    await expect(effective(tenantId, later)).resolves.toEqual({ mrnPrefix: 'NEW' });
  });

  it('answers null before anything is published, so the caller uses its default', async () => {
    const { tenantId } = await hospital();
    await expect(effective(tenantId, new Date())).resolves.toBeNull();
  });

  it('AT-CFG-003: refuses a past effective time, and audits a successful publish', async () => {
    const { tenantId, session } = await hospital();
    const refused = await publish(session, {
      body: { mrnPrefix: 'SMH' },
      effectiveFrom: new Date(Date.now() - 3_600_000).toISOString(),
      reason: 'Backdated',
    });
    expect(refused.status).toBe(422);
    await expect(effective(tenantId, new Date())).resolves.toBeNull();

    const res = await publish(session, { body: { mrnPrefix: 'SMH' }, reason: 'First setup' });
    const version = (await dataOf(res)) as { id: string };
    const rows = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findMany({ where: { action: 'config.policy.published' } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ targetId: version.id, reason: 'First setup' });
  });

  it('previews the change without publishing it', async () => {
    const { tenantId, session } = await hospital();
    await publish(session, { body: { mrnPrefix: 'OLD' }, reason: 'First setup' });
    const res = await client.call(session, 'POST', `${NUMBERING}/preview`, {
      body: { mrnPrefix: 'NEW' },
    });
    expect(res.status).toBe(200);
    expect(await dataOf(res)).toEqual({
      changes: [{ path: 'mrnPrefix', from: 'OLD', to: 'NEW' }],
    });
    await expect(effective(tenantId, new Date())).resolves.toEqual({ mrnPrefix: 'OLD' });
  });

  it('refuses a body that does not match the policy, and an unknown policy', async () => {
    const { session } = await hospital();
    const invalid = await publish(session, { body: { mrnPrefix: 'bad prefix' }, reason: 'Wrong' });
    expect(invalid.status).toBe(422);
    const extra = await publish(session, {
      body: { mrnPrefix: 'SMH', other: true },
      reason: 'Wrong',
    });
    expect(extra.status).toBe(422);
    const unknown = await client.call(
      session,
      'POST',
      '/config/policies/made-up/versions',
      { body: {}, reason: 'Wrong' },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(unknown.status).toBe(404);
  });

  it('is idempotent: a retry makes one version', async () => {
    const { session } = await hospital();
    const key = randomUUID();
    const payload = { body: { mrnPrefix: 'SMH' }, reason: 'First setup' };
    await publish(session, payload, key);
    const again = await publish(session, payload, key);
    expect(again.headers.get('Idempotent-Replay')).toBe('true');
    const list = await client.call(session, 'GET', NUMBERING);
    expect((await dataOf(list)) as unknown[]).toHaveLength(1);
  });

  it('keeps hospitals apart and needs the permission', async () => {
    const mine = await hospital();
    const other = await hospital();
    await publish(mine.session, { body: { mrnPrefix: 'SMH' }, reason: 'First setup' });
    await expect(effective(other.tenantId, new Date())).resolves.toBeNull();
    const staff = await seedUser(prisma, { passwordHash });
    await seedMembership(prisma, mine.tenantId, staff.id);
    const session = await client.sessionOf(staff.username, PASSWORD);
    expect((await client.call(session, 'GET', NUMBERING)).status).toBe(403);
  });

  it('never lets the app change a published version (FR-SAA-005)', async () => {
    const { tenantId, session } = await hospital();
    await publish(session, { body: { mrnPrefix: 'SMH' }, reason: 'First setup' });
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.policyVersion.updateMany({ data: { body: { mrnPrefix: 'HACK' } } }),
      ),
    ).rejects.toThrow();
  });
});
