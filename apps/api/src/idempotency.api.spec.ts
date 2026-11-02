import { randomUUID } from 'node:crypto';
import { Body, Controller, HttpCode, Inject, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
  RequirePermission,
} from '@hms/mod-identity-access';
import {
  ApiEndpoint,
  appendAuditEvent,
  DatabaseModule,
  getRequestContext,
  Idempotent,
  PRISMA,
  RequestPipelineModule,
} from '@hms/platform';
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
import { z } from 'zod';
import { configureApp } from './http/configure-app.js';
import { OperationsController } from './operations/operations.controller.js';

// Idempotent commands over real HTTP against PostgreSQL (T-PLT-01; FPR-08, SP-01, SP-02, SP-08;
// AT-PLT-001..003; D section 9.3).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date());
const resultSchema = z.object({ effectId: z.string() });
const RESULT = { status: 201, description: 'probe', schema: resultSchema };

// A stand-in business command: its audit row is the effect the tests count.
@RequirePermission('audit.view')
@Controller('probe')
class CommandProbeController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  private async effect(targetId: string): Promise<void> {
    const { tenantId, userId } = getRequestContext() as { tenantId: string; userId: string };
    await withTenant(this.prisma, { tenantId, userId }, (tx) =>
      appendAuditEvent(tx, {
        tenantId,
        action: 'probe.effect',
        outcome: 'SUCCEEDED',
        actorUserId: userId,
        targetType: 'probe',
        targetId,
      }),
    );
  }

  @Post('command')
  @HttpCode(201)
  @Idempotent('probe.command')
  @ApiEndpoint({ summary: 'command', success: RESULT, errors: [] })
  async command(@Body() body: { targetId: string }) {
    await this.effect(body.targetId);
    return { effectId: randomUUID() };
  }

  @Post('failing')
  @HttpCode(201)
  @Idempotent('probe.failing')
  @ApiEndpoint({ summary: 'failing', success: RESULT, errors: [] })
  async failing(@Body() body: { targetId: string; fail: boolean }) {
    await this.effect(body.targetId);
    if (body.fail) throw new Error('command failed after its effect');
    return { effectId: randomUUID() };
  }

  @Post('slow')
  @HttpCode(201)
  @Idempotent('probe.slow')
  @ApiEndpoint({ summary: 'slow', success: RESULT, errors: [] })
  async slow(@Body() body: { targetId: string }) {
    await this.effect(body.targetId);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { effectId: randomUUID() };
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
  controllers: [CommandProbeController, OperationsController],
})
class IdempotencyTestModule {}

describe('idempotent commands over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [IdempotencyTestModule],
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

  /** A signed-in member of a new hospital with the permission the probe needs. */
  async function staff(tenantId?: string) {
    const hospital = tenantId ?? (await seedTenant(prisma));
    const user = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, hospital, user.id);
    await grantPermissions(prisma, hospital, membership, ['audit.view']);
    return { tenantId: hospital, session: await client.sessionOf(user.username, PASSWORD) };
  }

  const send = (session: StaffSession, path: string, key: string | undefined, body: unknown) =>
    client.call(session, 'POST', path, body, key ? { 'Idempotency-Key': key } : {});

  const effects = (tenantId: string, targetId: string) =>
    withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.count({ where: { action: 'probe.effect', targetId } }),
    );

  it('AT-PLT-001: repeats the original answer without a second effect', async () => {
    const { tenantId, session } = await staff();
    const key = randomUUID();
    const targetId = randomUUID();
    const first = await send(session, '/probe/command', key, { targetId });
    expect(first.status).toBe(201);
    expect(first.headers.get('Idempotent-Replay')).toBeNull();
    const firstData = await dataOf(first);

    const second = await send(session, '/probe/command', key, { targetId });
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotent-Replay')).toBe('true');
    expect(await dataOf(second)).toEqual(firstData);
    expect(await effects(tenantId, targetId)).toBe(1);
  });

  it('AT-PLT-002: refuses the same key with a different body, and changes nothing', async () => {
    const { tenantId, session } = await staff();
    const key = randomUUID();
    const targetId = randomUUID();
    await send(session, '/probe/command', key, { targetId });
    const other = randomUUID();
    const res = await send(session, '/probe/command', key, { targetId: other });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await effects(tenantId, other)).toBe(0);
  });

  it('AT-PLT-003: concurrent duplicates make one effect and the same answer', async () => {
    const { tenantId, session } = await staff();
    const key = randomUUID();
    const targetId = randomUUID();
    const answers = await Promise.all(
      [1, 2, 3, 4].map(() => send(session, '/probe/slow', key, { targetId })),
    );
    expect(answers.map((answer) => answer.status)).toEqual([201, 201, 201, 201]);
    const ids = await Promise.all(answers.map(async (answer) => (await dataOf(answer)).effectId));
    expect(new Set(ids).size).toBe(1);
    expect(await effects(tenantId, targetId)).toBe(1);
  });

  it('a failed command keeps no effect and no record, so a retry runs again', async () => {
    const { tenantId, session } = await staff();
    const key = randomUUID();
    const targetId = randomUUID();
    const failed = await send(session, '/probe/failing', key, { targetId, fail: true });
    expect(failed.status).toBe(500);
    expect(await effects(tenantId, targetId)).toBe(0);
    const unknown = await client.call(session, 'GET', `/operations/${key}`);
    expect(unknown.status).toBe(404);
  });

  it('needs a well-formed key', async () => {
    const { session } = await staff();
    const body = { targetId: randomUUID() };
    expect((await send(session, '/probe/command', undefined, body)).status).toBe(422);
    expect((await send(session, '/probe/command', 'not-a-uuid', body)).status).toBe(422);
  });

  it('scopes keys to the user: another user may use the same key', async () => {
    const first = await staff();
    const second = await staff(first.tenantId);
    const key = randomUUID();
    const targetId = randomUUID();
    await send(first.session, '/probe/command', key, { targetId });
    const res = await send(second.session, '/probe/command', key, { targetId });
    expect(res.headers.get('Idempotent-Replay')).toBeNull();
    expect(await effects(first.tenantId, targetId)).toBe(2);
  });

  it('SP-08: /operations/{key} answers with the outcome, for its own user only', async () => {
    const { tenantId, session } = await staff();
    const stranger = await staff();
    const colleague = await staff(tenantId);
    const key = randomUUID();
    const sent = await send(session, '/probe/command', key, { targetId: randomUUID() });
    const data = await dataOf(sent);

    const res = await client.call(session, 'GET', `/operations/${key}`);
    expect(res.status).toBe(200);
    expect(await dataOf(res)).toMatchObject({
      idempotencyKey: key,
      operation: 'probe.command',
      status: 'COMPLETED',
      result: data,
    });
    expect((await client.call(stranger.session, 'GET', `/operations/${key}`)).status).toBe(404);
    expect((await client.call(colleague.session, 'GET', `/operations/${key}`)).status).toBe(404);
  });

  it('AT-PLT-004: a key past its expiry is treated as new', async () => {
    const { tenantId, session } = await staff();
    const key = randomUUID();
    const targetId = randomUUID();
    await send(session, '/probe/command', key, { targetId });
    await withTenant(prisma, { tenantId }, (tx) =>
      tx.idempotencyRecord.updateMany({
        where: { idemKey: key },
        data: { expiresAt: new Date(Date.now() - 1000) },
      }),
    );
    expect((await client.call(session, 'GET', `/operations/${key}`)).status).toBe(404);
    const res = await send(session, '/probe/command', key, { targetId });
    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotent-Replay')).toBeNull();
    expect(await effects(tenantId, targetId)).toBe(2);
  });
});
