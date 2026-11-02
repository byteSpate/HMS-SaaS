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
import { appendAuditEvent, DatabaseModule, RequestPipelineModule } from '@hms/platform';
import {
  dataOf,
  grantPermissions,
  seedMembership,
  seedTenant,
  seedUser,
  staffClient,
  type StaffClient,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// Audit search over real HTTP against PostgreSQL (T-PLT-02; FR-AUD-005; AT-AUD-005; SCR-24).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date());

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
})
class AuditTestModule {}

interface Row {
  id: string;
  action: string;
  actorName: string | null;
  targetId: string | null;
}

describe('audit search over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [AuditTestModule] }).compile();
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
    const auditor = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, auditor.id);
    await grantPermissions(prisma, tenantId, membership, ['audit.view']);
    const session = await client.sessionOf(auditor.username, PASSWORD);

    const search = async (query = '') => {
      const res = await client.call(session, 'GET', `/audit/events${query}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Row[]; meta: { nextCursor: string | null } };
      return { rows: body.data, nextCursor: body.meta.nextCursor };
    };
    const event = (action: string, actorUserId: string, targetId?: string) =>
      withTenant(prisma, { tenantId }, (tx) =>
        appendAuditEvent(tx, {
          tenantId,
          action,
          outcome: 'SUCCEEDED',
          actorUserId,
          ...(targetId ? { targetType: 'probe', targetId } : {}),
        }),
      );
    return { tenantId, auditor, session, search, event };
  }

  it('lists the newest events first, with the name of who did it', async () => {
    const { auditor, search, event } = await hospital();
    await event('probe.first', auditor.id);
    await event('probe.second', auditor.id);
    const { rows } = await search('?action=probe.');
    expect(rows.map((row) => row.action)).toEqual(['probe.second', 'probe.first']);
    expect(rows[0]?.actorName).toBe('Test User');
  });

  it('filters by action prefix, record, person and time', async () => {
    const { tenantId, auditor, search, event } = await hospital();
    const colleague = await seedUser(prisma, { passwordHash });
    await seedMembership(prisma, tenantId, colleague.id);
    const targetId = randomUUID();
    await event('probe.mine', auditor.id, targetId);
    await event('other.theirs', colleague.id);

    const byAction = await search('?action=other.');
    expect(byAction.rows.map((row) => row.action)).toEqual(['other.theirs']);
    const byRecord = await search(`?targetId=${targetId}`);
    expect(byRecord.rows.map((row) => row.action)).toEqual(['probe.mine']);
    const byPerson = await search(`?actor=${colleague.username}`);
    expect(byPerson.rows.map((row) => row.action)).toEqual(['other.theirs']);
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect((await search(`?from=${encodeURIComponent(future)}`)).rows).toEqual([]);
    const past = new Date(Date.now() - 3_600_000).toISOString();
    expect((await search(`?to=${encodeURIComponent(past)}`)).rows).toEqual([]);
  });

  it('pages through results with a cursor, without repeats', async () => {
    const { auditor, search, event } = await hospital();
    for (const action of ['probe.a', 'probe.b', 'probe.c']) await event(action, auditor.id);

    const first = await search('?action=probe.&limit=2');
    expect(first.rows.map((row) => row.action)).toEqual(['probe.c', 'probe.b']);
    expect(first.nextCursor).not.toBeNull();
    const second = await search(`?action=probe.&limit=2&cursor=${first.nextCursor}`);
    expect(second.rows.map((row) => row.action)).toEqual(['probe.a']);
    expect(second.nextCursor).toBeNull();
  });

  it('never shows another hospital, even by its person or record', async () => {
    const mine = await hospital();
    const other = await hospital();
    const targetId = randomUUID();
    await other.event('probe.other', other.auditor.id, targetId);

    expect((await mine.search(`?targetId=${targetId}`)).rows).toEqual([]);
    expect((await mine.search(`?actor=${other.auditor.username}`)).rows).toEqual([]);
    expect((await mine.search('?action=probe.other')).rows).toEqual([]);
  });

  it('needs audit.view, and the refusal is itself searchable (AT-AUD-002)', async () => {
    const { tenantId, search } = await hospital();
    const staff = await seedUser(prisma, { passwordHash });
    await seedMembership(prisma, tenantId, staff.id);
    const session = await client.sessionOf(staff.username, PASSWORD);

    const refused = await client.call(session, 'GET', '/audit/events');
    expect(refused.status).toBe(403);
    const { rows } = await search(`?actor=${staff.username}`);
    expect(rows[0]).toMatchObject({ action: 'authz.access.denied', outcome: 'DENIED' });
  });

  it('refuses a malformed filter', async () => {
    const { session } = await hospital();
    for (const query of ['?targetId=nope', '?limit=1000', '?from=yesterday', '?cursor=nope']) {
      const res = await client.call(session, 'GET', `/audit/events${query}`);
      expect(res.status, query).toBe(422);
    }
  });

  it('keeps an empty search answer in the envelope', async () => {
    const { session } = await hospital();
    const res = await client.call(session, 'GET', '/audit/events?action=nothing.like.this');
    expect(await dataOf(res)).toEqual([]);
  });
});
