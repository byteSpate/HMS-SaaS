import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
  Public,
  RequirePermission,
} from '@hms/mod-identity-access';
import { DatabaseModule, RawResponse, RequestPipelineModule } from '@hms/platform';
import {
  grantPermissions,
  seedMembership,
  seedTenant,
  seedUser,
  staffClient,
  type StaffClient,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// The per-session API limit over real HTTP (T-PLT-07 part 2; NFR-SEC-005; D section 8.6 layer 7).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date());
const LIMIT = 3;

@RawResponse()
@Controller('probe')
class LimitProbeController {
  @RequirePermission('audit.view')
  @Get('private')
  privateRoute() {
    return { ok: true };
  }

  @Public()
  @Get('open')
  openRoute() {
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
        apiRateLimit: { limit: LIMIT, windowMs: 60_000 },
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
  ],
  controllers: [LimitProbeController],
})
class LimitTestModule {}

describe('per-session API rate limit', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;
  let base: string;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [LimitTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
    client = staffClient(base, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function signedIn() {
    const tenantId = await seedTenant(prisma);
    const user = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, user.id);
    await grantPermissions(prisma, tenantId, membership, ['audit.view']);
    return client.sessionOf(user.username, PASSWORD);
  }

  it('answers RATE_LIMITED over the limit, with Retry-After', async () => {
    const session = await signedIn();
    for (let i = 0; i < LIMIT; i += 1) {
      expect((await client.call(session, 'GET', '/probe/private')).status).toBe(200);
    }
    const refused = await client.call(session, 'GET', '/probe/private');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect(await refused.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('counts each session separately', async () => {
    const busy = await signedIn();
    for (let i = 0; i <= LIMIT; i += 1) await client.call(busy, 'GET', '/probe/private');
    const other = await signedIn();
    expect((await client.call(other, 'GET', '/probe/private')).status).toBe(200);
  });

  it('does not count routes without a session', async () => {
    for (let i = 0; i <= LIMIT + 1; i += 1) {
      expect((await fetch(`${base}/probe/open`)).status).toBe(200);
    }
  });
});
