import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Practitioner, ScheduleSession } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
} from '@hms/mod-identity-access';
import { PatientsModule } from '@hms/mod-patients';
import { SchedulingModule } from '@hms/mod-scheduling';
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

// Schedule sessions over real HTTP against PostgreSQL (T-SCH-01; FR-SCH-002; AT-SCH-001; C-035;
// SP-03; FR-AUD-001). "Now" is 10:00 in Dhaka on 2026-11-12. Names are synthetic (AS-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date('2026-11-12T04:00:00Z'));

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
    PatientsModule.forRoot({ clock, nidKey: Buffer.alloc(32, 9) }),
    SchedulingModule.forRoot({ clock }),
  ],
})
class ScheduleSessionsTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

describe('schedule sessions over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleSessionsTestModule],
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

  /** A hospital with patients and scheduling, a practitioner admin and a scheduler. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['patients', 'scheduling']);
    const admin = await staffOf(tenantId, ['practitioner.manage']);
    const scheduler = await staffOf(tenantId, ['scheduling.schedule.manage']);
    return { tenantId, admin, scheduler };
  }

  async function practitioner(admin: StaffSession, nameEn = 'Karim Uddin'): Promise<Practitioner> {
    const res = await client.call(
      admin,
      'POST',
      '/practitioners',
      { nameEn, specialty: 'Medicine' },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(res.status).toBe(201);
    return (await dataOf(res)) as Practitioner;
  }

  const eveningOf = (practitionerId: string, sessionDate = '2026-11-13') => ({
    practitionerId,
    sessionDate,
    startTime: '17:00',
    endTime: '21:00',
    capacity: 20,
  });

  const create = (session: StaffSession, body: unknown, key: string = randomUUID()) =>
    client.call(session, 'POST', '/schedule-sessions', body, { 'Idempotency-Key': key });

  const change = (session: StaffSession, id: string, action: string, expectedVersion: number) =>
    client.call(
      session,
      'POST',
      `/schedule-sessions/${id}/${action}`,
      { expectedVersion },
      { 'Idempotency-Key': randomUUID() },
    );

  async function created(session: StaffSession, body: unknown): Promise<ScheduleSession> {
    const res = await create(session, body);
    expect(res.status).toBe(201);
    return (await dataOf(res)) as ScheduleSession;
  }

  async function list(session: StaffSession, query: string): Promise<ScheduleSession[]> {
    const res = await client.call(session, 'GET', `/schedule-sessions?${query}`);
    expect(res.status).toBe(200);
    return ((await dataOf(res)) as { sessions: ScheduleSession[] }).sessions;
  }

  async function problemOf(res: Response): Promise<Problem> {
    return (await res.json()) as Problem;
  }

  it('AT-SCH-001: creates a draft on the hospital clock, lists it and publishes it', async () => {
    const { tenantId, admin, scheduler } = await hospital();
    const doctor = await practitioner(admin);
    const draft = await created(scheduler, eveningOf(doctor.practitionerId));
    expect(draft).toMatchObject({
      practitioner: { practitionerId: doctor.practitionerId, nameEn: 'Karim Uddin' },
      sessionDate: '2026-11-13',
      startTime: '17:00',
      endTime: '21:00',
      startsAt: '2026-11-13T11:00:00.000Z',
      endsAt: '2026-11-13T15:00:00.000Z',
      capacity: 20,
      bookedCount: 0,
      status: 'DRAFT',
      version: 1,
    });

    const published = await change(scheduler, draft.sessionId, 'publish', 1);
    expect(published.status).toBe(200);
    expect(await dataOf(published)).toMatchObject({ status: 'PUBLISHED', version: 2 });

    const listed = await list(scheduler, 'from=2026-11-12&to=2026-11-14');
    expect(listed.map((row) => [row.sessionId, row.status])).toEqual([
      [draft.sessionId, 'PUBLISHED'],
    ]);
    expect(await list(scheduler, 'from=2026-11-14&to=2026-11-20')).toEqual([]);

    const audits = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findMany({
        where: { targetType: 'schedule_session', targetId: draft.sessionId },
        orderBy: { occurredAt: 'asc' },
        select: { action: true },
      }),
    );
    expect(audits.map((row) => row.action)).toEqual([
      'scheduling.session.created',
      'scheduling.session.published',
    ]);
  });

  it('AT-SCH-001: rejects a session that has ended and one that ends before it starts', async () => {
    const { admin, scheduler } = await hospital();
    const doctor = await practitioner(admin);
    const yesterday = await create(scheduler, eveningOf(doctor.practitionerId, '2026-11-11'));
    expect(yesterday.status).toBe(422);
    expect((await problemOf(yesterday)).fields?.[0]?.path).toBe('sessionDate');

    const backwards = await create(scheduler, {
      ...eveningOf(doctor.practitionerId),
      endTime: '16:00',
    });
    expect((await problemOf(backwards)).fields?.[0]?.path).toBe('endTime');

    const badTime = await create(scheduler, {
      ...eveningOf(doctor.practitionerId),
      startTime: '5pm',
    });
    expect((await problemOf(badTime)).fields?.[0]?.path).toBe('startTime');
  });

  it('refuses an inactive practitioner and one of another hospital', async () => {
    const { admin, scheduler } = await hospital();
    const doctor = await practitioner(admin);
    const deactivated = await client.call(
      admin,
      'PUT',
      `/practitioners/${doctor.practitionerId}`,
      { nameEn: doctor.nameEn, specialty: doctor.specialty, active: false, expectedVersion: 1 },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(deactivated.status).toBe(200);
    const inactive = await create(scheduler, eveningOf(doctor.practitionerId));
    expect((await problemOf(inactive)).fields?.[0]?.path).toBe('practitionerId');

    const other = await hospital();
    const theirs = await practitioner(other.admin);
    const foreign = await create(scheduler, eveningOf(theirs.practitionerId));
    expect((await problemOf(foreign)).fields?.[0]?.path).toBe('practitionerId');
  });

  it('refuses an overlapping session of the same doctor, unless that one is cancelled', async () => {
    const { admin, scheduler } = await hospital();
    const doctor = await practitioner(admin);
    const first = await created(scheduler, eveningOf(doctor.practitionerId));
    const overlapping = await create(scheduler, {
      ...eveningOf(doctor.practitionerId),
      startTime: '20:00',
      endTime: '22:00',
    });
    expect(overlapping.status).toBe(422);
    expect((await problemOf(overlapping)).fields?.[0]?.path).toBe('startTime');

    // Back to back is fine, and so is another doctor at the same time.
    await created(scheduler, {
      ...eveningOf(doctor.practitionerId),
      startTime: '21:00',
      endTime: '22:00',
    });
    const colleague = await practitioner(admin, 'Rahima Begum');
    await created(scheduler, eveningOf(colleague.practitionerId));

    expect((await change(scheduler, first.sessionId, 'cancel', 1)).status).toBe(200);
    await created(scheduler, eveningOf(doctor.practitionerId));
  });

  it('cancels a session; publishing twice or a cancelled one is INVALID_TRANSITION', async () => {
    const { admin, scheduler } = await hospital();
    const doctor = await practitioner(admin);
    const draft = await created(scheduler, eveningOf(doctor.practitionerId));
    expect((await change(scheduler, draft.sessionId, 'publish', 1)).status).toBe(200);

    const again = await change(scheduler, draft.sessionId, 'publish', 2);
    expect(again.status).toBe(409);
    expect((await problemOf(again)).code).toBe('INVALID_TRANSITION');

    const cancelled = await change(scheduler, draft.sessionId, 'cancel', 2);
    expect(await dataOf(cancelled)).toMatchObject({ status: 'CANCELLED', version: 3 });
    const republish = await change(scheduler, draft.sessionId, 'publish', 3);
    expect((await problemOf(republish)).code).toBe('INVALID_TRANSITION');
  });

  it('SP-03: a stale version is STALE_RECORD', async () => {
    const { admin, scheduler } = await hospital();
    const doctor = await practitioner(admin);
    const draft = await created(scheduler, eveningOf(doctor.practitionerId));
    const stale = await change(scheduler, draft.sessionId, 'publish', 2);
    expect(stale.status).toBe(409);
    expect((await problemOf(stale)).code).toBe('STALE_RECORD');
  });

  it('a retry with the same Idempotency-Key returns the same session', async () => {
    const { admin, scheduler } = await hospital();
    const doctor = await practitioner(admin);
    const key = randomUUID();
    const first = await create(scheduler, eveningOf(doctor.practitionerId), key);
    const retry = await create(scheduler, eveningOf(doctor.practitionerId), key);
    expect(retry.status).toBe(201);
    expect(((await dataOf(retry)) as ScheduleSession).sessionId).toBe(
      ((await dataOf(first)) as ScheduleSession).sessionId,
    );
  });

  it('lists by practitioner and refuses a range that is reversed or too long', async () => {
    const { admin, scheduler } = await hospital();
    const karim = await practitioner(admin);
    const rahima = await practitioner(admin, 'Rahima Begum');
    await created(scheduler, eveningOf(karim.practitionerId));
    const hers = await created(scheduler, eveningOf(rahima.practitionerId));
    const only = await list(
      scheduler,
      `from=2026-11-13&to=2026-11-13&practitionerId=${rahima.practitionerId}`,
    );
    expect(only.map((row) => row.sessionId)).toEqual([hers.sessionId]);

    const reversed = await client.call(
      scheduler,
      'GET',
      '/schedule-sessions?from=2026-11-14&to=2026-11-13',
    );
    expect((await problemOf(reversed)).fields?.[0]?.path).toBe('to');
    const tooLong = await client.call(
      scheduler,
      'GET',
      '/schedule-sessions?from=2026-11-01&to=2027-02-01',
    );
    expect((await problemOf(tooLong)).fields?.[0]?.path).toBe('to');
  });

  it('offers only active practitioners in the picker', async () => {
    const { admin, scheduler } = await hospital();
    const karim = await practitioner(admin);
    const rahima = await practitioner(admin, 'Rahima Begum');
    const deactivated = await client.call(
      admin,
      'PUT',
      `/practitioners/${rahima.practitionerId}`,
      { nameEn: rahima.nameEn, active: false, expectedVersion: 1 },
      { 'Idempotency-Key': randomUUID() },
    );
    expect(deactivated.status).toBe(200);
    const res = await client.call(scheduler, 'GET', '/schedule-sessions/practitioner-choices');
    expect(res.status).toBe(200);
    const { practitioners } = (await dataOf(res)) as {
      practitioners: { practitionerId: string }[];
    };
    expect(practitioners.map((row) => row.practitionerId)).toEqual([karim.practitionerId]);
  });

  it("hides another hospital's sessions", async () => {
    const mine = await hospital();
    const theirs = await hospital();
    const doctor = await practitioner(theirs.admin);
    const their = await created(theirs.scheduler, eveningOf(doctor.practitionerId));
    expect(await list(mine.scheduler, 'from=2026-11-13&to=2026-11-13')).toEqual([]);
    const publish = await change(mine.scheduler, their.sessionId, 'publish', 1);
    expect(publish.status).toBe(404);
  });

  it('needs scheduling.schedule.manage and the scheduling module', async () => {
    const { admin } = await hospital();
    const doctor = await practitioner(admin);
    const denied = await create(admin, eveningOf(doctor.practitionerId));
    expect(denied.status).toBe(403);
    expect((await problemOf(denied)).code).toBe('PERMISSION_DENIED');

    const noModule = await seedTenant(prisma);
    await seedEntitlements(prisma, noModule, ['patients']);
    const scheduler = await staffOf(noModule, ['scheduling.schedule.manage']);
    const missing = await client.call(
      scheduler,
      'GET',
      '/schedule-sessions?from=2026-11-13&to=2026-11-13',
    );
    expect((await problemOf(missing)).code).toBe('ENTITLEMENT_MISSING');
  });
});
