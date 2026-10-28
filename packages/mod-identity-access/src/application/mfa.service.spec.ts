import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '@hms/database';
import { DomainError, fixedClock, type FixedClock } from '@hms/domain-kernel';
import { grantPermissions, seedMembership, seedTenant, seedUser } from '@hms/testkit';
import { findMfa } from '../infrastructure/mfa.repository.js';
import { hashPassword } from '../infrastructure/password-hasher.js';
import { openSecret } from '../infrastructure/secret-box.js';
import { timeStep, totpAt } from '../infrastructure/totp.js';
import { DEFAULT_LOGIN_RATE_LIMITS, type AuthConfig } from './auth.config.js';
import { AuthService, type AuthContext } from './auth.service.js';
import { LoginThrottle } from './login-throttle.js';
import { MfaService } from './mfa.service.js';

// T-ACC-04 against PostgreSQL: enrolment, step-up, replay and recovery codes (FR-ACC-006,
// AT-ACC-009, AT-ACC-010).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const PASSWORD = 'correct horse battery';
const meta = { ipAddress: '127.0.0.1' };
const config: AuthConfig = {
  timeouts: { idleMinutes: 60, absoluteHours: 12 },
  csrfSecret: 'x'.repeat(32),
  lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
  loginRateLimits: { ...DEFAULT_LOGIN_RATE_LIMITS, perIp: { limit: 10_000, windowMs: 60_000 } },
  mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
};

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (error) => error instanceof DomainError && error.code === code,
  );
}

describe('MfaService', () => {
  let prisma: PrismaClient;
  let clock: FixedClock;
  let auth: AuthService;
  let mfa: MfaService;
  let passwordHash: string;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    clock = fixedClock(new Date('2026-10-28T08:00:00.000Z'));
    auth = new AuthService(prisma, config, clock, LoginThrottle.inMemory(config.loginRateLimits));
    mfa = new MfaService(prisma, config, clock, auth);
    passwordHash = await hashPassword(PASSWORD);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** A user whose only hospital role holds an administration permission (privileged). */
  async function administrator() {
    const user = await seedUser(prisma, { passwordHash });
    const tenantId = await seedTenant(prisma);
    const membershipId = await seedMembership(prisma, tenantId, user.id);
    await grantPermissions(prisma, tenantId, membershipId, ['admin.user.manage']);
    return user;
  }

  async function signIn(username: string): Promise<{ ctx: AuthContext; token: string }> {
    const { token, session } = await auth.login({ username, password: PASSWORD }, meta);
    expect(session.activeMembershipId).not.toBeNull();
    const ctx = await auth.resolveSession(token);
    if (!ctx) throw new Error('no session');
    return { ctx, token };
  }

  async function currentCode(userId: string): Promise<string> {
    const row = await findMfa(prisma, userId);
    if (!row) throw new Error('no MFA row');
    const secret = openSecret(config.mfa.encryptionKey, row.secretCiphertext);
    return totpAt(secret, timeStep(clock.now()));
  }

  async function enrolled(userId: string, ctx: AuthContext) {
    await mfa.startEnrolment(ctx);
    return mfa.confirmEnrolment(ctx, await currentCode(userId), meta);
  }

  it('reports that a privileged session needs a second factor', async () => {
    const user = await administrator();
    const { session } = await auth.login({ username: user.username, password: PASSWORD }, meta);
    expect(session.mfa).toEqual({ required: true, enrolled: false, verified: false });
  });

  it('does not ask other staff for a second factor', async () => {
    const user = await seedUser(prisma, { passwordHash });
    const tenantId = await seedTenant(prisma);
    const membershipId = await seedMembership(prisma, tenantId, user.id);
    await grantPermissions(prisma, tenantId, membershipId, ['billing.payment.record']);
    const { session } = await auth.login({ username: user.username, password: PASSWORD }, meta);
    expect(session.mfa.required).toBe(false);
  });

  it('enrols with the first code, returns 10 recovery codes and rotates the session', async () => {
    const user = await administrator();
    const { ctx, token } = await signIn(user.username);
    const start = await mfa.startEnrolment(ctx);
    expect(start.otpauthUri).toContain(`otpauth://totp/HMS%20test:${user.username}`);

    const confirmed = await mfa.confirmEnrolment(ctx, await currentCode(user.id), meta);
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect(confirmed.issued.session.mfa).toEqual({
      required: true,
      enrolled: true,
      verified: true,
    });
    expect(await auth.resolveSession(token)).toBeNull();
    const rotated = await auth.resolveSession(confirmed.issued.token);
    expect(rotated?.mfaVerifiedAt).not.toBeNull();
    expect(rotated?.membershipId).toBe(ctx.membershipId);
  });

  it('never replaces an enabled factor through enrolment', async () => {
    const user = await administrator();
    const { ctx } = await signIn(user.username);
    const { issued } = await enrolled(user.id, ctx);
    const after = await auth.resolveSession(issued.token);
    await expectCode(mfa.startEnrolment(after!), 'INVALID_TRANSITION');
  });

  it('refuses a wrong code and counts it towards the lock', async () => {
    const user = await administrator();
    const { ctx } = await signIn(user.username);
    await enrolled(user.id, ctx);
    const next = await signIn(user.username);
    await expectCode(mfa.verify(next.ctx, { code: '000000' }, meta), 'MFA_CODE_INVALID');
    const stored = await prisma.userAccount.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.failedAttempts).toBe(1);
  });

  it('refuses a code from a time step that was already used (replay)', async () => {
    const user = await administrator();
    const { ctx } = await signIn(user.username);
    await mfa.startEnrolment(ctx);
    const code = await currentCode(user.id);
    await mfa.confirmEnrolment(ctx, code, meta);

    const second = await signIn(user.username);
    await expectCode(mfa.verify(second.ctx, { code }, meta), 'MFA_CODE_INVALID');
    clock.advanceBy(30_000);
    const third = await signIn(user.username);
    const issued = await mfa.verify(third.ctx, { code: await currentCode(user.id) }, meta);
    expect(issued.session.mfa.verified).toBe(true);
  });

  it('accepts each recovery code once', async () => {
    const user = await administrator();
    const { ctx } = await signIn(user.username);
    const { recoveryCodes } = await enrolled(user.id, ctx);
    const recoveryCode = recoveryCodes[0]!.toUpperCase();

    const first = await signIn(user.username);
    const issued = await mfa.verify(first.ctx, { recoveryCode }, meta);
    expect(issued.session.mfa.verified).toBe(true);
    const again = await signIn(user.username);
    await expectCode(mfa.verify(again.ctx, { recoveryCode }, meta), 'MFA_CODE_INVALID');
  });

  it('keeps the second factor when the user switches hospital', async () => {
    const user = await administrator();
    await seedMembership(prisma, await seedTenant(prisma), user.id);
    const { token } = await auth.login({ username: user.username, password: PASSWORD }, meta);
    const ctx = (await auth.resolveSession(token))!;
    const { memberships } = await auth.describeSession(ctx, token);
    const first = await auth.selectMembership(ctx, memberships[0]!.id, meta);
    const firstCtx = (await auth.resolveSession(first.token))!;
    const { issued } = await enrolled(user.id, firstCtx);
    const verifiedCtx = (await auth.resolveSession(issued.token))!;
    const switched = await auth.selectMembership(verifiedCtx, memberships[1]!.id, meta);
    expect((await auth.resolveSession(switched.token))?.mfaVerifiedAt).not.toBeNull();
  });
});
