import { Controller, Get, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import { IdentityAccessModule, hashPassword } from '@hms/mod-identity-access';
import { DatabaseModule } from '@hms/platform';
import { seedMembership, seedTenant, seedUser } from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// AT-ACC-001..005 over real HTTP against PostgreSQL (T-ACC-01, ADR-004, ADR-021).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date());

// A tenant-scoped probe route, standing in for any business endpoint (AT-ACC-003, AT-ACC-004).
@Controller('probe')
class ProbeController {
  @Get('tenant-data')
  read() {
    return { ok: true };
  }

  @Post('tenant-data')
  write() {
    return { ok: true };
  }
}

@Module({
  imports: [
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      { timeouts: { idleMinutes: 60, absoluteHours: 12 }, csrfSecret: 'y'.repeat(32) },
      clock,
      { allowedOrigins: [WEB] },
    ),
  ],
  controllers: [ProbeController],
})
class TestAppModule {}

function cookieFrom(res: Response): string {
  const header = res.headers.get('set-cookie') ?? '';
  return header.split(';')[0] ?? '';
}

describe('auth over HTTP', () => {
  let app: NestExpressApplication;
  let base: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function seedLogin(hospitals: number) {
    const user = await seedUser(prisma, { passwordHash: await hashPassword(PASSWORD) });
    const memberships: string[] = [];
    for (let i = 0; i < hospitals; i += 1) {
      memberships.push(await seedMembership(prisma, await seedTenant(prisma), user.id));
    }
    return { ...user, memberships };
  }

  function login(username: string, password = PASSWORD) {
    return fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ username, password }),
    });
  }

  it('AT-ACC-001: valid login sets a secure host-only cookie', async () => {
    const user = await seedLogin(1);
    const res = await login(user.username);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^__Host-hms_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Domain=/i);
  });

  it('AT-ACC-002: wrong password gives a generic 401', async () => {
    const user = await seedLogin(1);
    const res = await login(user.username, 'wrong');
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('INVALID_CREDENTIALS');
  });

  it('AT-ACC-003: a multi-hospital user must choose before tenant requests', async () => {
    const user = await seedLogin(2);
    const res = await login(user.username);
    const cookie = cookieFrom(res);
    const { csrfToken } = await res.json();
    const blocked = await fetch(`${base}/probe/tenant-data`, { headers: { Cookie: cookie } });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe('TENANT_NOT_SELECTED');

    const chosen = await fetch(`${base}/auth/session/membership`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: WEB,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ membershipId: user.memberships[0] }),
    });
    expect(chosen.status).toBe(200);
    const allowed = await fetch(`${base}/probe/tenant-data`, {
      headers: { Cookie: cookieFrom(chosen) },
    });
    expect(allowed.status).toBe(200);
  });

  it('AT-ACC-004: a state-changing request without the CSRF token is 403', async () => {
    const user = await seedLogin(1);
    const res = await login(user.username);
    const cookie = cookieFrom(res);
    const { csrfToken } = await res.json();
    const without = await fetch(`${base}/probe/tenant-data`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: WEB },
    });
    expect(without.status).toBe(403);
    expect((await without.json()).code).toBe('CSRF_TOKEN_INVALID');
    const foreignOrigin = await fetch(`${base}/probe/tenant-data`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://bytespate.com', 'X-CSRF-Token': csrfToken },
    });
    expect(foreignOrigin.status).toBe(403);
    const withToken = await fetch(`${base}/probe/tenant-data`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: WEB, 'X-CSRF-Token': csrfToken },
    });
    expect(withToken.status).toBe(201);
  });

  it('AT-ACC-005: an expired session is 401 and a fresh login works without an admin', async () => {
    const user = await seedLogin(1);
    const cookie = cookieFrom(await login(user.username));
    clock.advanceBy(61 * 60_000);
    const expired = await fetch(`${base}/auth/session`, { headers: { Cookie: cookie } });
    expect(expired.status).toBe(401);
    expect((await expired.json()).code).toBe('UNAUTHENTICATED');
    expect((await login(user.username)).status).toBe(200);
  });

  it('rejects a login from a foreign origin (login CSRF)', async () => {
    const user = await seedLogin(1);
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.bytespate.com' },
      body: JSON.stringify({ username: user.username, password: PASSWORD }),
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('replaces a client-supplied request id that is not a safe token (T-PLT-07)', async () => {
    const user = await seedLogin(1);
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'bad id; drop table' },
      body: JSON.stringify({ username: user.username, password: 'wrong' }),
    });
    const issuedId = res.headers.get('x-request-id');
    expect(issuedId).not.toBe('bad id; drop table');
    const events = await prisma.authEvent.findMany({ where: { userId: user.id } });
    expect(events).not.toHaveLength(0);
    expect(events.every((e) => e.correlationId === issuedId)).toBe(true);
  });

  it('returns 422 for an empty username', async () => {
    const res = await login('');
    expect(res.status).toBe(422);
  });

  it('logout clears the cookie and ends the session', async () => {
    const user = await seedLogin(1);
    const res = await login(user.username);
    const cookie = cookieFrom(res);
    const { csrfToken } = await res.json();
    const out = await fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: WEB, 'X-CSRF-Token': csrfToken },
    });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toMatch(/__Host-hms_session=;/);
    const after = await fetch(`${base}/auth/session`, { headers: { Cookie: cookie } });
    expect(after.status).toBe(401);
  });

  it('answers a CORS preflight only for the web origin', async () => {
    const preflight = await fetch(`${base}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: WEB,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-csrf-token',
      },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');
    const other = await fetch(`${base}/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://bytespate.com', 'Access-Control-Request-Method': 'POST' },
    });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  describe('PATCH /auth/preferences (FR-I18N-001)', () => {
    async function signedIn() {
      const user = await seedLogin(1);
      const res = await login(user.username);
      const { csrfToken } = await res.json();
      return { user, cookie: cookieFrom(res), csrfToken };
    }

    function patch(cookie: string, csrfToken: string | null, body: unknown) {
      return fetch(`${base}/auth/preferences`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          Origin: WEB,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify(body),
      });
    }

    it('changes the preferred language and it survives the next session read', async () => {
      const { user, cookie, csrfToken } = await signedIn();
      const changed = await patch(cookie, csrfToken, { preferredLang: 'en' });
      expect(changed.status).toBe(200);
      expect((await changed.json()).user.preferredLang).toBe('en');

      const session = await fetch(`${base}/auth/session`, { headers: { Cookie: cookie } });
      expect((await session.json()).user.preferredLang).toBe('en');
      const row = await prisma.userAccount.findUnique({ where: { id: user.id } });
      expect(row?.preferredLang).toBe('en');
    });

    it('rejects an unsupported language', async () => {
      const { cookie, csrfToken } = await signedIn();
      const res = await patch(cookie, csrfToken, { preferredLang: 'fr' });
      expect(res.status).toBe(422);
    });

    it('requires the CSRF token', async () => {
      const { cookie } = await signedIn();
      const res = await patch(cookie, null, { preferredLang: 'en' });
      expect(res.status).toBe(403);
    });

    it('requires a session', async () => {
      const res = await patch('', null, { preferredLang: 'en' });
      expect(res.status).toBe(401);
    });
  });
});
