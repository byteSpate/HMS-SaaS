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
import { DatabaseModule, RequestPipelineModule } from '@hms/platform';
import { grantPermissions, seedMembership, seedTenant, seedUser, totpCode } from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// Lockout, login rate limit, administrator lock/unlock and the second factor over real HTTP
// against PostgreSQL (T-ACC-03, T-ACC-04; UC-ACC-02; AT-ACC-006..010; FR-ACC-004, -006, -010).
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
        csrfSecret: 'w'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
  ],
})
class LockTestModule {}

interface Session {
  cookie: string;
  csrfToken: string;
}

describe('account lock over HTTP', () => {
  let app: NestExpressApplication;
  let base: string;
  let prisma: PrismaClient;
  let passwordHash: string;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [LockTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function login(username: string, password = PASSWORD) {
    return fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ username, password }),
    });
  }

  function cookieOf(res: Response): string {
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  }

  /** Signs in; a privileged user also enrols the second factor, as the UI makes them (T-ACC-04). */
  async function sessionOf(username: string): Promise<Session> {
    const res = await login(username);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { csrfToken: string; mfa: { required: boolean } };
    const session = { cookie: cookieOf(res), csrfToken: body.csrfToken };
    if (!body.mfa.required) return session;

    const enrolment = await call(session, 'POST', '/auth/mfa/enrolment');
    const { secret } = (await enrolment.json()) as { secret: string };
    const confirmed = await call(session, 'POST', '/auth/mfa/enrolment/confirm', {
      code: totpCode(secret, clock.now()),
    });
    expect(confirmed.status).toBe(200);
    const result = (await confirmed.json()) as { session: { csrfToken: string } };
    return { cookie: cookieOf(confirmed), csrfToken: result.session.csrfToken };
  }

  /** One hospital with an administrator (admin.user.manage) and a staff member. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    const admin = await seedUser(prisma, { passwordHash });
    const adminMembership = await seedMembership(prisma, tenantId, admin.id);
    await grantPermissions(prisma, tenantId, adminMembership, ['admin.user.manage']);
    const staff = await seedUser(prisma, { passwordHash });
    await seedMembership(prisma, tenantId, staff.id);
    return { tenantId, admin, staff };
  }

  function call(session: Session, method: 'GET' | 'POST', path: string, body?: unknown) {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        Cookie: session.cookie,
        Origin: WEB,
        'X-CSRF-Token': session.csrfToken,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  it('locks after 5 wrong passwords; the admin sees reason, time and source IP', async () => {
    const { admin, staff } = await hospital();
    for (let i = 0; i < 5; i += 1) {
      expect((await login(staff.username, 'wrong')).status).toBe(401);
    }
    const locked = await login(staff.username);
    expect(locked.status).toBe(423);
    expect(await locked.json()).toMatchObject({ code: 'ACCOUNT_LOCKED' });

    const adminSession = await sessionOf(admin.username);
    const res = await call(adminSession, 'GET', `/admin/users/${staff.id}/lock`);
    expect(res.status).toBe(200);
    const status = await res.json();
    expect(status).toMatchObject({
      status: 'LOCKED_TEMPORARY',
      failedAttempts: 5,
      lockReason: 'FAILED_LOGINS',
      lockedByUserId: null,
    });
    expect(status.lockedUntil).not.toBeNull();
    expect(status.recentAttempts[0]).toMatchObject({ ipAddress: expect.any(String) });
    expect(status.recentAttempts.map((a: { action: string }) => a.action)).toContain(
      'auth.account.locked',
    );
  });

  it('an admin lock ends open sessions and blocks login; unlock restores login', async () => {
    const { tenantId, admin, staff } = await hospital();
    const staffSession = await sessionOf(staff.username);
    const adminSession = await sessionOf(admin.username);

    const lock = await call(adminSession, 'POST', `/admin/users/${staff.id}/lock`, {
      reason: 'Left the hospital',
    });
    expect(lock.status).toBe(200);
    expect(await lock.json()).toMatchObject({
      status: 'LOCKED_ADMIN',
      lockReason: 'ADMIN_ACTION',
      lockNote: 'Left the hospital',
      lockedByUserId: admin.id,
    });
    // FR-ACC-010: the open session stops on its next request.
    expect((await call(staffSession, 'GET', '/auth/session')).status).toBe(401);
    expect((await login(staff.username)).status).toBe(423);

    const unlock = await call(adminSession, 'POST', `/admin/users/${staff.id}/unlock`, {
      reason: 'Returned to work',
    });
    expect(unlock.status).toBe(200);
    expect(await unlock.json()).toMatchObject({ status: 'ACTIVE', lockReason: null });
    expect((await login(staff.username)).status).toBe(200);

    const audit = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findMany({ where: { targetId: staff.id }, orderBy: { occurredAt: 'asc' } }),
    );
    expect(audit.map((e) => [e.action, e.actorUserId, e.reason])).toEqual([
      ['admin.user.locked', admin.id, 'Left the hospital'],
      ['admin.user.unlocked', admin.id, 'Returned to work'],
    ]);
  });

  it('an administrator cannot lock or unlock their own account', async () => {
    const { admin } = await hospital();
    const adminSession = await sessionOf(admin.username);
    const res = await call(adminSession, 'POST', `/admin/users/${admin.id}/unlock`, {
      reason: 'Myself',
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PERMISSION_DENIED');
  });

  it("another hospital's user, or a malformed ID, is NOT_FOUND", async () => {
    const { admin } = await hospital();
    const other = await hospital();
    const adminSession = await sessionOf(admin.username);
    expect((await call(adminSession, 'GET', `/admin/users/${other.staff.id}/lock`)).status).toBe(
      404,
    );
    const lock = await call(adminSession, 'POST', `/admin/users/${other.staff.id}/lock`, {
      reason: 'Not mine',
    });
    expect(lock.status).toBe(404);
    expect((await call(adminSession, 'GET', '/admin/users/not-a-uuid/lock')).status).toBe(404);
  });

  it('unlocking an account that is not locked is INVALID_TRANSITION', async () => {
    const { admin, staff } = await hospital();
    const adminSession = await sessionOf(admin.username);
    const res = await call(adminSession, 'POST', `/admin/users/${staff.id}/unlock`, {
      reason: 'Nothing to do',
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('INVALID_TRANSITION');
  });

  it('staff without admin.user.manage are refused', async () => {
    const { staff, admin } = await hospital();
    const staffSession = await sessionOf(staff.username);
    const res = await call(staffSession, 'GET', `/admin/users/${admin.id}/lock`);
    expect(res.status).toBe(403);
  });

  it('a privileged session gets MFA_REQUIRED until the second factor is set up (AT-ACC-009)', async () => {
    const { admin, staff } = await hospital();
    const res = await login(admin.username);
    const body = (await res.json()) as { csrfToken: string; mfa: unknown };
    expect(body.mfa).toEqual({ required: true, enrolled: false, verified: false });
    const passwordOnly = { cookie: cookieOf(res), csrfToken: body.csrfToken };

    const refused = await call(passwordOnly, 'GET', `/admin/users/${staff.id}/lock`);
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe('MFA_REQUIRED');

    const verified = await sessionOf(admin.username);
    expect((await call(verified, 'GET', `/admin/users/${staff.id}/lock`)).status).toBe(200);
  });

  it('asks again at the next login and refuses a replayed code (AT-ACC-010)', async () => {
    const { admin, staff } = await hospital();
    const first = await login(admin.username);
    const firstBody = (await first.json()) as { csrfToken: string };
    const firstSession = { cookie: cookieOf(first), csrfToken: firstBody.csrfToken };
    const enrolment = await call(firstSession, 'POST', '/auth/mfa/enrolment');
    const { secret } = (await enrolment.json()) as { secret: string };
    const usedCode = totpCode(secret, clock.now());
    const confirm = await call(firstSession, 'POST', '/auth/mfa/enrolment/confirm', {
      code: usedCode,
    });
    expect(confirm.status).toBe(200);

    const again = await login(admin.username);
    const againBody = (await again.json()) as { csrfToken: string; mfa: unknown };
    expect(againBody.mfa).toEqual({ required: true, enrolled: true, verified: false });
    const session = { cookie: cookieOf(again), csrfToken: againBody.csrfToken };
    const replay = await call(session, 'POST', '/auth/mfa/verify', { code: usedCode });
    expect(replay.status).toBe(401);
    expect((await replay.json()).code).toBe('MFA_CODE_INVALID');

    clock.advanceBy(30_000);
    const verify = await call(session, 'POST', '/auth/mfa/verify', {
      code: totpCode(secret, clock.now()),
    });
    expect(verify.status).toBe(200);
    const verifiedBody = (await verify.json()) as { csrfToken: string };
    const verified = { cookie: cookieOf(verify), csrfToken: verifiedBody.csrfToken };
    expect((await call(verified, 'GET', `/admin/users/${staff.id}/lock`)).status).toBe(200);
    // The pre-verification cookie was replaced (session rotation, D section 7.1).
    expect((await call(session, 'GET', '/auth/session')).status).toBe(401);
  });

  it('answers RATE_LIMITED with Retry-After after 10 tries on one account (AT-ACC-007)', async () => {
    const username = `rate-${Date.now()}`;
    for (let i = 0; i < DEFAULT_LOGIN_RATE_LIMITS.perAccount.limit; i += 1) {
      expect((await login(username, 'x')).status).toBe(401);
    }
    const refused = await login(username, 'x');
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await refused.json()).code).toBe('RATE_LIMITED');
  });
});
