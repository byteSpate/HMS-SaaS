import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { CashierSession, CashierSessionList, CurrentCashierSession } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import { BillingModule } from '@hms/mod-billing';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
} from '@hms/mod-identity-access';
import { DatabaseModule, RequestPipelineModule } from '@hms/platform';
import {
  dataOf,
  grantPermissions,
  seedEntitlements,
  seedMembership,
  seedTenant,
  seedUser,
  staffClient,
  type StaffClient,
  type StaffSession,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// Cashier sessions over real HTTP against PostgreSQL (T-BIL-03; FR-BIL-026; UC-BIL-04;
// AT-BIL-016, AT-BIL-017). "Now" is 10:00 in Dhaka on 2026-11-12. Names are synthetic (AS-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date('2026-11-12T04:00:00Z'));
const NOTHING = { CASH: '0.00', CARD: '0.00', MOBILE: '0.00', BANK_TRANSFER: '0.00' };

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 's'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
    BillingModule.forRoot({ clock }),
  ],
})
class CashierSessionTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

describe('cashier sessions over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [CashierSessionTestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    client = staffClient(`${await app.getUrl()}/api/v1`, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function staffOf(
    tenantId: string,
    permissions: Parameters<typeof grantPermissions>[3],
  ): Promise<StaffSession> {
    const user = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, user.id);
    if (permissions.length > 0) await grantPermissions(prisma, tenantId, membership, permissions);
    return client.sessionOf(user.username, PASSWORD);
  }

  /**
   * A hospital with billing. Staff are created on demand (a login hashes a password, so each one
   * costs time): a cashier, a finance user, or a supervisor who both takes money and reviews.
   */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['billing']);
    return {
      tenantId,
      cashier: () => staffOf(tenantId, ['billing.cashier_session.manage']),
      finance: () => staffOf(tenantId, ['billing.cashier_session.review']),
      both: () =>
        staffOf(tenantId, ['billing.cashier_session.manage', 'billing.cashier_session.review']),
    };
  }

  const post = (session: StaffSession, path: string, body: unknown, key = randomUUID()) =>
    client.call(session, 'POST', path, body, { 'Idempotency-Key': key });

  async function ok<T>(res: Response, status = 201): Promise<T> {
    expect(res.status).toBe(status);
    return (await dataOf(res)) as T;
  }

  async function refused(res: Response, status: number): Promise<Problem> {
    expect(res.status).toBe(status);
    return (await res.json()) as Problem;
  }

  const open = (staff: StaffSession, openingFloat?: string, key?: string) =>
    post(staff, '/billing/cashier-sessions', openingFloat ? { openingFloat } : {}, key);

  const close = (staff: StaffSession, session: CashierSession, counted = NOTHING) =>
    post(staff, `/billing/cashier-sessions/${session.sessionId}/close`, {
      expectedVersion: session.version,
      counted,
    });

  const review = (staff: StaffSession, session: CashierSession, note?: string) =>
    post(staff, `/billing/cashier-sessions/${session.sessionId}/review`, {
      expectedVersion: session.version,
      ...(note === undefined ? {} : { note }),
    });

  it('AT-BIL-016: one open session per cashier; the same key returns the same session', async () => {
    const staff = await hospital();
    const { tenantId } = staff;
    const [cashier, otherCashier] = [await staff.cashier(), await staff.cashier()];
    const key = randomUUID();
    const opened = await ok<CashierSession>(await open(cashier, '2000.00', key));
    expect(opened).toMatchObject({
      status: 'OPEN',
      openingFloat: '2000.00',
      closedAt: null,
      hasVariance: false,
      review: null,
    });
    expect(opened.totals).toEqual([
      { method: 'CASH', expected: '2000.00', counted: null, variance: null },
      { method: 'CARD', expected: '0.00', counted: null, variance: null },
      { method: 'MOBILE', expected: '0.00', counted: null, variance: null },
      { method: 'BANK_TRANSFER', expected: '0.00', counted: null, variance: null },
    ]);
    expect(opened.cashier.displayName).not.toBe('');

    const replay = await ok<CashierSession>(await open(cashier, '2000.00', key));
    expect(replay.sessionId).toBe(opened.sessionId);
    expect((await refused(await open(cashier), 409)).code).toBe('INVALID_TRANSITION');
    // Another cashier has a session of their own.
    await ok<CashierSession>(await open(otherCashier));

    const current = await ok<CurrentCashierSession>(
      await client.call(cashier, 'GET', '/billing/cashier-sessions/current'),
      200,
    );
    expect(current.session?.sessionId).toBe(opened.sessionId);
    const audit = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.count({ where: { action: 'billing.cashier_session.opened' } }),
    );
    expect(audit).toBe(2);
  });

  it('AT-BIL-017: closing stores expected, counted and variance per method', async () => {
    const staff = await hospital();
    const { tenantId } = staff;
    const cashier = await staff.cashier();
    const opened = await ok<CashierSession>(await open(cashier, '2000.00'));
    const closed = await ok<CashierSession>(
      await close(cashier, opened, { ...NOTHING, CASH: '1980.00', CARD: '50.00' }),
      200,
    );
    expect(closed).toMatchObject({ status: 'CLOSED_PENDING_REVIEW', hasVariance: true });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.totals).toEqual([
      { method: 'CASH', expected: '2000.00', counted: '1980.00', variance: '-20.00' },
      { method: 'CARD', expected: '0.00', counted: '50.00', variance: '50.00' },
      { method: 'MOBILE', expected: '0.00', counted: '0.00', variance: '0.00' },
      { method: 'BANK_TRANSFER', expected: '0.00', counted: '0.00', variance: '0.00' },
    ]);

    const current = await ok<CurrentCashierSession>(
      await client.call(cashier, 'GET', '/billing/cashier-sessions/current'),
      200,
    );
    expect(current.session).toBeNull();
    expect((await refused(await close(cashier, closed), 409)).code).toBe('INVALID_TRANSITION');
    const stored = await withTenant(prisma, { tenantId }, (tx) =>
      tx.cashierSessionCount.count({ where: { sessionId: opened.sessionId } }),
    );
    expect(stored).toBe(4);
  });

  it('only the cashier closes a session, and a stale version is refused', async () => {
    const staff = await hospital();
    const [cashier, otherCashier] = [await staff.cashier(), await staff.cashier()];
    const opened = await ok<CashierSession>(await open(cashier));
    expect((await refused(await close(otherCashier, opened), 403)).code).toBe('PERMISSION_DENIED');
    const stale = await refused(await close(cashier, { ...opened, version: 7 }), 409);
    expect(stale.code).toBe('STALE_RECORD');
  });

  it('AT-BIL-017: finance reviews; the cashier cannot review their own session', async () => {
    const staff = await hospital();
    const [both, finance] = [await staff.both(), await staff.finance()];
    const opened = await ok<CashierSession>(await open(both, '500.00'));
    const closed = await ok<CashierSession>(
      await close(both, opened, { ...NOTHING, CASH: '500.00' }),
      200,
    );
    expect(closed.hasVariance).toBe(false);
    expect((await refused(await review(both, closed), 403)).code).toBe('SEGREGATION_OF_DUTY');

    const pending = await ok<CashierSessionList>(
      await client.call(finance, 'GET', '/billing/cashier-sessions'),
      200,
    );
    expect(pending.sessions.map((session) => session.sessionId)).toEqual([closed.sessionId]);

    const reviewed = await ok<CashierSession>(await review(finance, closed), 200);
    expect(reviewed).toMatchObject({ status: 'REVIEWED', review: { note: null } });
    expect(reviewed.review?.reviewedBy.displayName).not.toBe('');
    expect((await refused(await review(finance, reviewed), 409)).code).toBe('INVALID_TRANSITION');

    const done = await ok<CashierSessionList>(
      await client.call(finance, 'GET', '/billing/cashier-sessions?status=REVIEWED'),
      200,
    );
    expect(done.sessions.map((session) => session.sessionId)).toEqual([closed.sessionId]);
  });

  it('a variance is accepted only with a note', async () => {
    const staff = await hospital();
    const [cashier, finance] = [await staff.cashier(), await staff.finance()];
    const opened = await ok<CashierSession>(await open(cashier, '1000.00'));
    const closed = await ok<CashierSession>(
      await close(cashier, opened, { ...NOTHING, CASH: '990.00' }),
      200,
    );
    const missing = await refused(await review(finance, closed, '  '), 422);
    expect(missing).toMatchObject({ code: 'VALIDATION_FAILED', fields: [{ path: 'note' }] });
    const reviewed = await ok<CashierSession>(
      await review(finance, closed, 'Short 10.00; change given twice'),
      200,
    );
    expect(reviewed.review?.note).toBe('Short 10.00; change given twice');
  });

  it('a cashier without the review permission cannot review, and another hospital sees nothing', async () => {
    const first = await hospital();
    const cashier = await first.cashier();
    const otherFinance = await (await hospital()).finance();
    const opened = await ok<CashierSession>(await open(cashier));
    const closed = await ok<CashierSession>(await close(cashier, opened), 200);
    expect((await refused(await review(cashier, closed), 403)).code).toBe('PERMISSION_DENIED');
    expect((await refused(await review(otherFinance, closed), 404)).code).toBe('NOT_FOUND');
    const theirs = await ok<CashierSessionList>(
      await client.call(otherFinance, 'GET', '/billing/cashier-sessions'),
      200,
    );
    expect(theirs.sessions).toEqual([]);
  });
});
