import { randomUUID } from 'node:crypto';
import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
  RequirePermission,
} from '@hms/mod-identity-access';
import { DatabaseModule, RequestPipelineModule } from '@hms/platform';
import {
  cookieOf,
  grantPermissions,
  seedMembership,
  seedTenant,
  seedUser,
  staffClient,
  type StaffClient,
  type StaffSession,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// User, membership and role administration over real HTTP against PostgreSQL (T-ACC-05;
// FR-ACC-007, FR-ACC-008, FR-ACC-010; AT-ACC-011; UC-ACC-01 A1).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const TEMPORARY = 'temporary pass 1';
const clock = fixedClock(new Date());

// Stands in for any business route: a core permission, so no module entitlement is involved.
@RequirePermission('audit.view')
@Controller('probe')
class ProbeController {
  @Get()
  read() {
    return { ok: true };
  }
}

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
  controllers: [ProbeController],
})
class UserAdminTestModule {}

describe('user administration over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [UserAdminTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    client = staffClient(`${await app.getUrl()}/api/v1`, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const call = (session: StaffSession, method: string, path: string, body?: unknown) =>
    client.call(session, method, path, body);

  /** A hospital with an administrator (users and roles) and one staff member without roles. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    const admin = await seedUser(prisma, { passwordHash });
    const adminMembership = await seedMembership(prisma, tenantId, admin.id);
    await grantPermissions(prisma, tenantId, adminMembership, [
      'admin.user.manage',
      'admin.role.manage',
    ]);
    const staff = await seedUser(prisma, { passwordHash });
    await seedMembership(prisma, tenantId, staff.id);
    const adminSession = await client.sessionOf(admin.username, PASSWORD);
    return { tenantId, admin, staff, adminSession };
  }

  async function auditorRole(adminSession: StaffSession): Promise<string> {
    const res = await call(adminSession, 'POST', '/admin/roles', {
      code: `AUDITOR_${randomUUID().slice(0, 8).toUpperCase().replace(/-/g, '')}`,
      nameEn: 'Auditor',
      permissions: ['audit.view'],
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  describe('asking for a new password while signed out (C-093, FR-ACC-012)', () => {
    async function ask(username: string, origin: string | null = WEB) {
      return fetch(`${await app.getUrl()}/api/v1/auth/password-reset-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(origin ? { Origin: origin } : {}),
        },
        body: JSON.stringify({ username }),
      });
    }

    async function requestedAt(adminSession: StaffSession, userId: string) {
      const res = await call(adminSession, 'GET', '/admin/users');
      const { users } = (await res.json()) as {
        users: { userId: string; passwordResetRequestedAt: string | null }[];
      };
      return users.find((user) => user.userId === userId)?.passwordResetRequestedAt;
    }

    it('answers the same for a real and an unknown username', async () => {
      const { staff } = await hospital();
      const real = await ask(staff.username);
      const unknown = await ask(`nobody-${randomUUID().slice(0, 8)}`);
      expect(real.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(await real.text()).toBe(await unknown.text());
    });

    it('flags only that person for the administrator and changes nothing else', async () => {
      const { admin, staff, adminSession } = await hospital();
      expect(await requestedAt(adminSession, staff.id)).toBeNull();

      await ask(staff.username.toUpperCase());

      expect(await requestedAt(adminSession, staff.id)).toEqual(expect.any(String));
      expect(await requestedAt(adminSession, admin.id)).toBeNull();
      expect((await client.login(staff.username, PASSWORD)).status).toBe(200);
    });

    it('is cleared when the administrator sets a temporary password', async () => {
      const { staff, adminSession } = await hospital();
      await ask(staff.username);
      const reset = await call(adminSession, 'POST', `/admin/users/${staff.id}/password`, {
        temporaryPassword: TEMPORARY,
        reason: 'Asked at the front desk',
      });
      expect(reset.ok).toBe(true);
      expect(await requestedAt(adminSession, staff.id)).toBeNull();
    });

    it('is cleared when the person changes their own password', async () => {
      const { staff, adminSession } = await hospital();
      await ask(staff.username);
      const session = await client.sessionOf(staff.username, PASSWORD);
      const changed = await call(session, 'POST', '/auth/password', {
        currentPassword: PASSWORD,
        newPassword: 'remembered it after all',
      });
      expect(changed.status).toBe(200);
      expect(await requestedAt(adminSession, staff.id)).toBeNull();
    });

    it('ignores a disabled account, with the same answer', async () => {
      const { staff, adminSession } = await hospital();
      await prisma.userAccount.update({ where: { id: staff.id }, data: { status: 'DISABLED' } });
      expect((await ask(staff.username)).status).toBe(202);
      expect(await requestedAt(adminSession, staff.id)).toBeNull();
    });

    it('refuses another website and is rate limited per account', async () => {
      const username = `flood-${randomUUID().slice(0, 8)}`;
      expect((await ask(username, 'https://evil.example')).status).toBe(403);
      const answers: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        answers.push((await ask(username)).status);
      }
      expect(answers[0]).toBe(202);
      expect(answers.at(-1)).toBe(429);
    });
  });

  it('creates a user who must replace the temporary password first (FR-ACC-007)', async () => {
    const { adminSession } = await hospital();
    const roleId = await auditorRole(adminSession);
    const username = `new-${Date.now()}`;
    const created = await call(adminSession, 'POST', '/admin/users', {
      username,
      displayName: 'New Person',
      temporaryPassword: TEMPORARY,
      roleIds: [roleId],
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ username, mustChangePassword: true });

    const firstLogin = await client.login(username, TEMPORARY);
    const first = (await firstLogin.json()) as {
      csrfToken: string;
      passwordChangeRequired: boolean;
    };
    expect(first.passwordChangeRequired).toBe(true);
    const temporarySession = { cookie: cookieOf(firstLogin), csrfToken: first.csrfToken };
    const refused = await call(temporarySession, 'GET', '/probe');
    expect(refused.status).toBe(403);
    expect((await refused.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');

    const changed = await call(temporarySession, 'POST', '/auth/password', {
      currentPassword: TEMPORARY,
      newPassword: 'my own password 2',
    });
    expect(changed.status).toBe(200);
    const after = (await changed.json()) as {
      csrfToken: string;
      passwordChangeRequired: boolean;
      permissions: string[];
    };
    expect(after.passwordChangeRequired).toBe(false);
    expect(after.permissions).toContain('audit.view');
    const ownSession = { cookie: cookieOf(changed), csrfToken: after.csrfToken };
    expect((await call(ownSession, 'GET', '/probe')).status).toBe(200);
    expect((await client.login(username, TEMPORARY)).status).toBe(401);
  });

  it('refuses a username that is already used', async () => {
    const { adminSession, staff } = await hospital();
    const res = await call(adminSession, 'POST', '/admin/users', {
      username: staff.username,
      displayName: 'Copy',
      temporaryPassword: TEMPORARY,
      roleIds: [],
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('USERNAME_TAKEN');
  });

  it('a wrong current password is a field error, not a sign-out', async () => {
    const { staff } = await hospital();
    const session = await client.sessionOf(staff.username, PASSWORD);
    const res = await call(session, 'POST', '/auth/password', {
      currentPassword: 'not my password',
      newPassword: 'a brand new password',
    });
    expect(res.status).toBe(422);
    expect((await call(session, 'GET', '/auth/session')).status).toBe(200);
  });

  it('revoking a membership ends the session on the next request (AT-ACC-011)', async () => {
    const { staff, adminSession } = await hospital();
    const staffSession = await client.sessionOf(staff.username, PASSWORD);
    expect((await call(staffSession, 'GET', '/auth/session')).status).toBe(200);

    const revoked = await call(adminSession, 'POST', `/admin/users/${staff.id}/membership`, {
      status: 'REVOKED',
      reason: 'Contract ended',
    });
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toMatchObject({ membershipStatus: 'REVOKED' });
    expect((await call(staffSession, 'GET', '/auth/session')).status).toBe(401);

    const back = await call(adminSession, 'POST', `/admin/users/${staff.id}/membership`, {
      status: 'ACTIVE',
      reason: 'Changed my mind',
    });
    expect(back.status).toBe(409);
  });

  it('a role change applies on the next request of the same session', async () => {
    const { staff, adminSession } = await hospital();
    const roleId = await auditorRole(adminSession);
    const staffSession = await client.sessionOf(staff.username, PASSWORD);
    expect((await call(staffSession, 'GET', '/probe')).status).toBe(403);

    const res = await call(adminSession, 'PUT', `/admin/users/${staff.id}/roles`, {
      roleIds: [roleId],
    });
    expect(res.status).toBe(200);
    expect((await call(staffSession, 'GET', '/probe')).status).toBe(200);
  });

  it('a password reset ends open sessions and forces a change', async () => {
    const { staff, adminSession } = await hospital();
    const staffSession = await client.sessionOf(staff.username, PASSWORD);
    const res = await call(adminSession, 'POST', `/admin/users/${staff.id}/password`, {
      temporaryPassword: TEMPORARY,
      reason: 'Forgot the password',
    });
    expect(res.status).toBe(200);
    expect((await call(staffSession, 'GET', '/auth/session')).status).toBe(401);
    const login = await client.login(staff.username, TEMPORARY);
    const body = (await login.json()) as { passwordChangeRequired: boolean };
    expect(body.passwordChangeRequired).toBe(true);
  });

  it('resets a lost second factor; the user enrols again at next login', async () => {
    const { tenantId, adminSession } = await hospital();
    const other = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, other.id);
    await grantPermissions(prisma, tenantId, membership, ['admin.user.manage']);
    const otherSession = await client.sessionOf(other.username, PASSWORD);

    const reset = await call(adminSession, 'POST', `/admin/users/${other.id}/mfa/reset`, {
      reason: 'Lost phone',
    });
    expect(reset.status).toBe(200);
    expect(await reset.json()).toMatchObject({ mfaEnrolled: false });
    expect((await call(otherSession, 'GET', '/auth/session')).status).toBe(401);
    const login = await client.login(other.username, PASSWORD);
    expect(((await login.json()) as { mfa: { enrolled: boolean } }).mfa.enrolled).toBe(false);

    const again = await call(adminSession, 'POST', `/admin/users/${other.id}/mfa/reset`, {
      reason: 'Twice',
    });
    expect(again.status).toBe(409);
  });

  it('roles start from templates; an administrator cannot lock themselves out', async () => {
    const { adminSession } = await hospital();
    const list = await call(adminSession, 'GET', '/admin/roles');
    const body = (await list.json()) as {
      templates: { code: string }[];
      roles: { id: string; permissions: string[] }[];
    };
    expect(body.templates.map((t) => t.code)).toContain('ADM');
    const ownRole = body.roles.find((r) => r.permissions.includes('admin.role.manage'));
    expect(ownRole).toBeDefined();

    const lockout = await call(adminSession, 'PUT', `/admin/roles/${ownRole!.id}/permissions`, {
      permissions: ['admin.user.manage'],
    });
    expect(lockout.status).toBe(403);
    const widened = await call(adminSession, 'PUT', `/admin/roles/${ownRole!.id}/permissions`, {
      permissions: [...ownRole!.permissions, 'audit.view'],
    });
    expect(widened.status).toBe(200);
  });

  it("refuses changes to the administrator's own account and other hospitals' users", async () => {
    const { admin, adminSession } = await hospital();
    const own = await call(adminSession, 'POST', `/admin/users/${admin.id}/password`, {
      temporaryPassword: TEMPORARY,
      reason: 'Myself',
    });
    expect(own.status).toBe(403);
    const other = await hospital();
    const foreign = await call(adminSession, 'PUT', `/admin/users/${other.staff.id}/roles`, {
      roleIds: [],
    });
    expect(foreign.status).toBe(404);
    const list = (await (await call(adminSession, 'GET', '/admin/users')).json()) as {
      users: { userId: string }[];
    };
    expect(list.users.map((u) => u.userId)).not.toContain(other.staff.id);
  });

  // An account has one password, one second factor and one lock across every hospital it belongs
  // to, so one hospital's administrator changing them would let them sign in to another (C-094).
  describe('an account that also belongs to another hospital', () => {
    async function sharedStaff() {
      const first = await hospital();
      const second = await hospital();
      await seedMembership(prisma, second.tenantId, first.staff.id);
      return { adminSession: first.adminSession, staff: first.staff };
    }

    it('refuses a password reset and keeps the old password', async () => {
      const { adminSession, staff } = await sharedStaff();
      const res = await call(adminSession, 'POST', `/admin/users/${staff.id}/password`, {
        temporaryPassword: TEMPORARY,
        reason: 'Forgot it',
      });
      expect(res.status).toBe(403);
      await expect(client.sessionOf(staff.username, PASSWORD)).resolves.toBeDefined();
    });

    it('refuses a second factor reset', async () => {
      const { adminSession, staff } = await sharedStaff();
      const res = await call(adminSession, 'POST', `/admin/users/${staff.id}/mfa/reset`, {
        reason: 'Lost phone',
      });
      expect(res.status).toBe(403);
    });

    it('refuses locking the account', async () => {
      const { adminSession, staff } = await sharedStaff();
      const res = await call(adminSession, 'POST', `/admin/users/${staff.id}/lock`, {
        reason: 'Left the hospital',
      });
      expect(res.status).toBe(403);
    });

    it('allows the same reset once the other membership is revoked', async () => {
      const first = await hospital();
      const second = await hospital();
      await seedMembership(prisma, second.tenantId, first.staff.id, 'REVOKED');
      const res = await call(
        first.adminSession,
        'POST',
        `/admin/users/${first.staff.id}/password`,
        {
          temporaryPassword: TEMPORARY,
          reason: 'Forgot it',
        },
      );
      expect(res.status).toBe(200);
    });
  });
});
