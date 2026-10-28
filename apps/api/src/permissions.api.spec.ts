import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import {
  createRolesFromTemplates,
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
  RequirePermission,
} from '@hms/mod-identity-access';
import { DatabaseModule, RequestPipelineModule } from '@hms/platform';
import {
  grantPermissions,
  seedEntitlements,
  seedMembership,
  seedTenant,
  seedUser,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// Route permission guard over real HTTP against PostgreSQL (T-ACC-02, FR-ACC-009, FR-SAA-004,
// AT-SAA-002, D section 7.2): entitlement, then permission, default deny, audited refusals.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';

@Controller('probe')
class GuardedProbeController {
  @RequirePermission('billing.payment.record')
  @Get('payment')
  payment() {
    return { ok: true };
  }

  @RequirePermission('billing.discount.approve')
  @Get('discount-approval')
  discountApproval() {
    return { ok: true };
  }

  @RequirePermission('lab.result.verify', 'lab.result.release')
  @Get('lab-release')
  labRelease() {
    return { ok: true };
  }

  // Deliberately unmarked: default deny must refuse it.
  @Get('forgotten')
  forgotten() {
    return { ok: true };
  }
}

@Module({
  imports: [
    // The pipeline gives each request its correlation ID, which the denial audit must carry.
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'z'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      fixedClock(new Date()),
      { allowedOrigins: [WEB] },
    ),
  ],
  controllers: [GuardedProbeController],
})
class PermissionTestModule {}

function cookieFrom(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

describe('permission guard over HTTP', () => {
  let app: NestExpressApplication;
  let base: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    const moduleRef = await Test.createTestingModule({ imports: [PermissionTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function login(username: string) {
    return fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
  }

  /** One user with one hospital; `login` returns a session cookie bound to that hospital. */
  async function staffSession() {
    const user = await seedUser(prisma, { passwordHash: await hashPassword(PASSWORD) });
    const tenantId = await seedTenant(prisma);
    const membershipId = await seedMembership(prisma, tenantId, user.id);
    return {
      tenantId,
      membershipId,
      login: async () => {
        const res = await login(user.username);
        expect(res.status).toBe(200);
        return cookieFrom(res);
      },
    };
  }

  function get(path: string, cookie: string) {
    return fetch(`${base}/probe/${path}`, { headers: { Cookie: cookie } });
  }

  function deniedEvents(tenantId: string, membershipId: string) {
    return withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findMany({ where: { membershipId, action: 'authz.access.denied' } }),
    );
  }

  it('allows a route when the module is entitled and the permission granted', async () => {
    const staff = await staffSession();
    await seedEntitlements(prisma, staff.tenantId, ['billing']);
    await grantPermissions(prisma, staff.tenantId, staff.membershipId, ['billing.payment.record']);
    const res = await get('payment', await staff.login());
    expect(res.status).toBe(200);
    expect(await deniedEvents(staff.tenantId, staff.membershipId)).toEqual([]);
  });

  it('AT-SAA-002: refuses an entitled module without the permission, and audits it', async () => {
    const staff = await staffSession();
    await seedEntitlements(prisma, staff.tenantId, ['billing']);
    const res = await get('payment', await staff.login());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PERMISSION_DENIED');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const events = await deniedEvents(staff.tenantId, staff.membershipId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      outcome: 'DENIED',
      reason: 'PERMISSION_DENIED',
      correlationId: res.headers.get('x-request-id'),
      details: {
        route: 'GuardedProbeController.payment',
        required: 'billing.payment.record',
        missing: 'billing.payment.record',
      },
    });
  });

  it('AT-SAA-002: refuses a permission without the module entitlement', async () => {
    const staff = await staffSession();
    await grantPermissions(prisma, staff.tenantId, staff.membershipId, ['billing.payment.record']);
    const res = await get('payment', await staff.login());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ENTITLEMENT_MISSING');
    const [event] = await deniedEvents(staff.tenantId, staff.membershipId);
    expect(event).toMatchObject({ reason: 'ENTITLEMENT_MISSING', details: { missing: 'billing' } });
  });

  it('requires every listed permission', async () => {
    const staff = await staffSession();
    await seedEntitlements(prisma, staff.tenantId, ['lab']);
    await grantPermissions(prisma, staff.tenantId, staff.membershipId, ['lab.result.verify']);
    const res = await get('lab-release', await staff.login());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PERMISSION_DENIED');
  });

  it('refuses a route without a marker even for a user holding every template role', async () => {
    const staff = await staffSession();
    await withTenant(prisma, { tenantId: staff.tenantId }, async (tx) => {
      const roles = await createRolesFromTemplates(tx, staff.tenantId);
      await tx.membershipRole.createMany({
        data: Object.values(roles).map((roleId) => ({
          tenantId: staff.tenantId,
          membershipId: staff.membershipId,
          roleId,
        })),
      });
    });
    const res = await get('forgotten', await staff.login());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PERMISSION_DENIED');
    const [event] = await deniedEvents(staff.tenantId, staff.membershipId);
    expect(event).toMatchObject({ reason: 'NO_ROUTE_MARKER' });
  });

  it('grants what the cashier template holds and nothing more (C-042, C01 section 5)', async () => {
    const staff = await staffSession();
    await seedEntitlements(prisma, staff.tenantId, ['billing']);
    await withTenant(prisma, { tenantId: staff.tenantId }, async (tx) => {
      const roles = await createRolesFromTemplates(tx, staff.tenantId);
      await tx.membershipRole.create({
        data: { tenantId: staff.tenantId, membershipId: staff.membershipId, roleId: roles.CSH },
      });
    });
    const cookie = await staff.login();
    expect((await get('payment', cookie)).status).toBe(200);
    expect((await get('discount-approval', cookie)).status).toBe(403);
  });

  it("does not count a role from the user's other hospital", async () => {
    const user = await seedUser(prisma, { passwordHash: await hashPassword(PASSWORD) });
    const tenantA = await seedTenant(prisma, 'Alpha Hospital');
    const tenantB = await seedTenant(prisma, 'Beta Clinic');
    const membershipA = await seedMembership(prisma, tenantA, user.id);
    const membershipB = await seedMembership(prisma, tenantB, user.id);
    await seedEntitlements(prisma, tenantA, ['billing']);
    await seedEntitlements(prisma, tenantB, ['billing']);
    await grantPermissions(prisma, tenantA, membershipA, ['billing.payment.record']);

    const loggedIn = await login(user.username);
    const { csrfToken } = await loggedIn.json();
    const chooseB = await fetch(`${base}/auth/session/membership`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieFrom(loggedIn),
        Origin: WEB,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ membershipId: membershipB }),
    });
    expect(chooseB.status).toBe(200);
    const res = await get('payment', cookieFrom(chooseB));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PERMISSION_DENIED');
  });
});
