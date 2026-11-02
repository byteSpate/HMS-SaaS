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
import { DatabaseModule, RequestPipelineModule } from '@hms/platform';
import { dataOf, seedMembership, seedTenant, seedUser } from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// One account per hospital, and usernames unique within a hospital (T-ACC-06; C-099; C-094).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
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
class AccountsTestModule {}

describe('per-hospital accounts', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let base: string;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    const moduleRef = await Test.createTestingModule({ imports: [AccountsTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const login = (hospitalCode: string, username: string, password: string) =>
    fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ hospitalCode, username, password }),
    });

  /** A hospital and its code; the fixture names the code test-<first 8 of the ID>. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    return { tenantId, code: `test-${tenantId.slice(0, 8)}` };
  }

  async function member(tenantId: string, username: string, password: string) {
    const user = await seedUser(prisma, { passwordHash: await hashPassword(password), username });
    await seedMembership(prisma, tenantId, user.id);
    return user;
  }

  const uniqueName = () => `rahim-${randomUUID().slice(0, 8)}`;

  it('lets two hospitals use the same username, with separate passwords', async () => {
    const first = await hospital();
    const second = await hospital();
    const username = uniqueName();
    await member(first.tenantId, username, 'first hospital password');
    await member(second.tenantId, username, 'second hospital password');

    const a = await login(first.code, username, 'first hospital password');
    expect(a.status).toBe(200);
    const session = (await dataOf(a)) as { memberships: { tenantId: string }[] };
    expect(session.memberships.map((m) => m.tenantId)).toEqual([first.tenantId]);
    expect((await login(second.code, username, 'second hospital password')).status).toBe(200);
    expect((await login(second.code, username, 'first hospital password')).status).toBe(401);
  });

  it('activates the hospital at login, with no step to choose one', async () => {
    const { tenantId, code } = await hospital();
    const username = uniqueName();
    const user = await member(tenantId, username, 'correct horse battery');
    const session = (await dataOf(await login(code, username, 'correct horse battery'))) as {
      activeMembershipId: string | null;
    };
    const membership = await withTenant(prisma, { tenantId }, (tx) =>
      tx.membership.findFirstOrThrow({ where: { userId: user.id } }),
    );
    expect(session.activeMembershipId).toBe(membership.id);
  });

  it('answers the same for an unknown hospital and a wrong password', async () => {
    const { tenantId, code } = await hospital();
    const username = uniqueName();
    await member(tenantId, username, 'correct horse battery');
    const unknown = await login('no-such-hospital', username, 'correct horse battery');
    const wrong = await login(code, username, 'not the password');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(((await unknown.json()) as { code: string }).code).toBe(
      ((await wrong.json()) as { code: string }).code,
    );
  });

  it('accepts the hospital code in any case and with spaces', async () => {
    const { tenantId, code } = await hospital();
    const username = uniqueName();
    await member(tenantId, username, 'correct horse battery');
    const res = await login(`  ${code.toUpperCase()} `, username, 'correct horse battery');
    expect(res.status).toBe(200);
  });

  it('needs a hospital code', async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ username: 'someone', password: 'password' }),
    });
    expect(res.status).toBe(422);
  });

  it('refuses to add an account to a second hospital, at the database', async () => {
    const first = await hospital();
    const second = await hospital();
    const user = await member(first.tenantId, uniqueName(), 'correct horse battery');
    await expect(seedMembership(prisma, second.tenantId, user.id)).rejects.toThrow();
  });

  it('refuses the same username twice in one hospital, at the database', async () => {
    const { tenantId } = await hospital();
    const username = uniqueName();
    await member(tenantId, username, 'correct horse battery');
    await expect(member(tenantId, username, 'another password here')).rejects.toThrow();
  });
});
