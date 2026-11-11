import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Appointment, ScheduleSession } from '@hms/contracts';
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

// Appointments over real HTTP against PostgreSQL (T-SCH-02; FR-SCH-001..005; UC-SCH-01/02;
// AT-SCH-002..006; C-035; SP-03). "Now" is 10:00 in Dhaka on 2026-11-12. Names are synthetic.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date('2026-11-12T04:00:00Z'));
const HOUR = 3_600_000;

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60 * 24, absoluteHours: 48 },
        csrfSecret: 'a'.repeat(32),
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
class AppointmentsTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

describe('appointments over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [AppointmentsTestModule],
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

  const post = (session: StaffSession, path: string, body: unknown) =>
    client.call(session, 'POST', path, body, { 'Idempotency-Key': randomUUID() });

  async function problemOf(res: Response): Promise<Problem> {
    return (await res.json()) as Problem;
  }

  /**
   * A hospital with one doctor, a scheduler, a receptionist who books, and helpers to add
   * published sessions and patients.
   */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['patients', 'scheduling']);
    const admin = await staffOf(tenantId, ['practitioner.manage']);
    const scheduler = await staffOf(tenantId, ['scheduling.schedule.manage']);
    const reception = await staffOf(tenantId, [
      'scheduling.appointment.book',
      'patient.record.register',
    ]);
    const doctor = await post(admin, '/practitioners', { nameEn: 'Karim Uddin' });
    const practitionerId = ((await dataOf(doctor)) as { practitionerId: string }).practitionerId;

    async function session(times: {
      date?: string;
      start: string;
      end: string;
      capacity?: number;
      publish?: boolean;
    }): Promise<ScheduleSession> {
      const res = await post(scheduler, '/schedule-sessions', {
        practitionerId,
        sessionDate: times.date ?? '2026-11-12',
        startTime: times.start,
        endTime: times.end,
        capacity: times.capacity ?? 10,
      });
      expect(res.status).toBe(201);
      const draft = (await dataOf(res)) as ScheduleSession;
      if (times.publish === false) return draft;
      const published = await post(scheduler, `/schedule-sessions/${draft.sessionId}/publish`, {
        expectedVersion: 1,
      });
      expect(published.status).toBe(200);
      return (await dataOf(published)) as ScheduleSession;
    }

    let phone = 1;
    async function patient(nameEn = 'Salma Begum'): Promise<string> {
      const res = await post(reception, '/patients', {
        nameEn,
        sex: 'FEMALE',
        birthDate: '1990-05-14',
        phone: `0171100${String(phone++).padStart(4, '0')}`,
        confirmNewDespiteCandidates: true,
        shownCandidateIds: [],
      });
      expect(res.status).toBe(201);
      return ((await dataOf(res)) as { patientId: string }).patientId;
    }

    return { tenantId, scheduler, reception, session, patient };
  }

  const book = (session: StaffSession, patientId: string, sessionId: string) =>
    post(session, '/appointments', { patientId, sessionId });

  async function booked(session: StaffSession, patientId: string, sessionId: string) {
    const res = await book(session, patientId, sessionId);
    expect(res.status).toBe(201);
    return (await dataOf(res)) as Appointment;
  }

  async function listOf(session: StaffSession, query: string): Promise<Appointment[]> {
    const res = await client.call(session, 'GET', `/appointments?${query}`);
    expect(res.status).toBe(200);
    return ((await dataOf(res)) as { appointments: Appointment[] }).appointments;
  }

  async function bookedCount(tenantId: string, sessionId: string): Promise<number> {
    const row = await withTenant(prisma, { tenantId }, (tx) =>
      tx.scheduleSession.findUniqueOrThrow({ where: { id: sessionId } }),
    );
    return row.bookedCount;
  }

  it('AT-SCH-002: books a patient, takes one place, listed by session and patient', async () => {
    const { tenantId, reception, session, patient } = await hospital();
    const evening = await session({ start: '17:00', end: '21:00' });
    const salma = await patient();
    const appointment = await booked(reception, salma, evening.sessionId);
    expect(appointment).toMatchObject({
      patient: { patientId: salma, nameEn: 'Salma Begum' },
      session: { sessionId: evening.sessionId, startTime: '17:00', endTime: '21:00' },
      status: 'BOOKED',
      rescheduledFromId: null,
      cancelReason: null,
      version: 1,
    });
    expect(await bookedCount(tenantId, evening.sessionId)).toBe(1);

    const bySession = await listOf(reception, `sessionId=${evening.sessionId}`);
    expect(bySession.map((row) => row.appointmentId)).toEqual([appointment.appointmentId]);
    const byPatient = await listOf(reception, `patientId=${salma}`);
    expect(byPatient.map((row) => row.appointmentId)).toEqual([appointment.appointmentId]);

    const audits = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findMany({
        where: { targetType: 'appointment', targetId: appointment.appointmentId },
        select: { action: true },
      }),
    );
    expect(audits.map((row) => row.action)).toEqual(['scheduling.appointment.booked']);
  });

  it('UC-SCH-01: refuses a draft or ended session, an unknown patient, a double booking', async () => {
    const { reception, session, patient } = await hospital();
    const salma = await patient();
    const draft = await session({ start: '17:00', end: '21:00', publish: false });
    const refusedDraft = await book(reception, salma, draft.sessionId);
    expect(refusedDraft.status).toBe(422);
    expect((await problemOf(refusedDraft)).fields?.[0]?.path).toBe('sessionId');

    const morning = await session({ start: '09:00', end: '11:00' });
    clock.advanceBy(2 * HOUR);
    try {
      const ended = await book(reception, salma, morning.sessionId);
      expect((await problemOf(ended)).fields?.[0]?.path).toBe('sessionId');
    } finally {
      clock.advanceBy(-2 * HOUR);
    }

    const evening = await session({ start: '17:00', end: '21:00', date: '2026-11-13' });
    const nobody = await book(reception, randomUUID(), evening.sessionId);
    expect((await problemOf(nobody)).fields?.[0]?.path).toBe('patientId');

    await booked(reception, salma, evening.sessionId);
    const twice = await book(reception, salma, evening.sessionId);
    expect(twice.status).toBe(422);
    expect((await problemOf(twice)).fields?.[0]?.path).toBe('patientId');
  });

  it('AT-SCH-003: of two concurrent bookings for the last place, one is CAPACITY_FULL', async () => {
    const { tenantId, reception, session, patient } = await hospital();
    const small = await session({ start: '17:00', end: '21:00', capacity: 1 });
    const [first, second] = [await patient('Salma Begum'), await patient('Rahima Khatun')];
    const results = await Promise.all([
      book(reception, first, small.sessionId),
      book(reception, second, small.sessionId),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const loser = results.find((res) => res.status === 409);
    expect((await problemOf(loser as Response)).code).toBe('CAPACITY_FULL');
    expect(await bookedCount(tenantId, small.sessionId)).toBe(1);
  });

  it('of two concurrent bookings of one patient in one session, the second is a field error', async () => {
    const { tenantId, reception, session, patient } = await hospital();
    const evening = await session({ start: '17:00', end: '21:00' });
    const salma = await patient();
    const results = await Promise.all([
      book(reception, salma, evening.sessionId),
      book(reception, salma, evening.sessionId),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 422]);
    const loser = results.find((res) => res.status === 422);
    expect((await problemOf(loser as Response)).fields?.[0]?.path).toBe('patientId');
    expect(await bookedCount(tenantId, evening.sessionId)).toBe(1);
  });

  it('AT-SCH-004: reschedules in one step: old RESCHEDULED, new BOOKED and linked', async () => {
    const { tenantId, reception, session, patient } = await hospital();
    const today = await session({ start: '17:00', end: '21:00' });
    const tomorrow = await session({ start: '17:00', end: '21:00', date: '2026-11-13' });
    const salma = await patient();
    const original = await booked(reception, salma, today.sessionId);

    const res = await post(reception, `/appointments/${original.appointmentId}/reschedule`, {
      sessionId: tomorrow.sessionId,
      expectedVersion: 1,
    });
    expect(res.status).toBe(201);
    const moved = (await dataOf(res)) as Appointment;
    expect(moved).toMatchObject({
      status: 'BOOKED',
      rescheduledFromId: original.appointmentId,
      session: { sessionId: tomorrow.sessionId },
    });
    const history = await listOf(reception, `patientId=${salma}`);
    expect(history.map((row) => [row.appointmentId, row.status])).toEqual([
      [original.appointmentId, 'RESCHEDULED'],
      [moved.appointmentId, 'BOOKED'],
    ]);
    expect(await bookedCount(tenantId, today.sessionId)).toBe(0);
    expect(await bookedCount(tenantId, tomorrow.sessionId)).toBe(1);
  });

  it('a reschedule into a full session changes nothing', async () => {
    const { tenantId, reception, session, patient } = await hospital();
    const today = await session({ start: '17:00', end: '21:00' });
    const full = await session({ start: '17:00', end: '21:00', date: '2026-11-13', capacity: 1 });
    const [salma, rahima] = [await patient('Salma Begum'), await patient('Rahima Khatun')];
    await booked(reception, rahima, full.sessionId);
    const original = await booked(reception, salma, today.sessionId);

    const res = await post(reception, `/appointments/${original.appointmentId}/reschedule`, {
      sessionId: full.sessionId,
      expectedVersion: 1,
    });
    expect((await problemOf(res)).code).toBe('CAPACITY_FULL');
    const [still] = await listOf(reception, `patientId=${salma}`);
    expect(still).toMatchObject({ status: 'BOOKED', version: 1 });
    expect(await bookedCount(tenantId, today.sessionId)).toBe(1);
  });

  it('AT-SCH-005: cancels with a reason and frees the place; a second cancel is refused', async () => {
    const { tenantId, scheduler, reception, session, patient } = await hospital();
    const evening = await session({ start: '17:00', end: '21:00' });
    const salma = await patient();
    const appointment = await booked(reception, salma, evening.sessionId);

    // T-SCH-01: a session with bookings cannot be cancelled.
    const busy = await post(scheduler, `/schedule-sessions/${evening.sessionId}/cancel`, {
      expectedVersion: evening.version,
    });
    expect((await problemOf(busy)).code).toBe('INVALID_TRANSITION');

    const short = await post(reception, `/appointments/${appointment.appointmentId}/cancel`, {
      reason: 'no',
      expectedVersion: 1,
    });
    expect((await problemOf(short)).fields?.[0]?.path).toBe('reason');

    const res = await post(reception, `/appointments/${appointment.appointmentId}/cancel`, {
      reason: 'Patient called to cancel',
      expectedVersion: 1,
    });
    expect(res.status).toBe(200);
    expect(await dataOf(res)).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Patient called to cancel',
      version: 2,
    });
    expect(await bookedCount(tenantId, evening.sessionId)).toBe(0);

    const again = await post(reception, `/appointments/${appointment.appointmentId}/cancel`, {
      reason: 'Patient called to cancel',
      expectedVersion: 2,
    });
    expect((await problemOf(again)).code).toBe('INVALID_TRANSITION');
    // The place is free again, so the same patient can book anew.
    await booked(reception, salma, evening.sessionId);
  });

  it('AT-SCH-006: marks a no-show only after the session ends; the place stays counted', async () => {
    const { tenantId, reception, session, patient } = await hospital();
    const morning = await session({ start: '09:00', end: '11:00' });
    const salma = await patient();
    const appointment = await booked(reception, salma, morning.sessionId);
    const early = await post(reception, `/appointments/${appointment.appointmentId}/no-show`, {
      expectedVersion: 1,
    });
    expect((await problemOf(early)).code).toBe('INVALID_TRANSITION');

    clock.advanceBy(2 * HOUR);
    try {
      const res = await post(reception, `/appointments/${appointment.appointmentId}/no-show`, {
        expectedVersion: 1,
      });
      expect(res.status).toBe(200);
      expect(await dataOf(res)).toMatchObject({ status: 'NO_SHOW', version: 2 });
      expect(await bookedCount(tenantId, morning.sessionId)).toBe(1);
    } finally {
      clock.advanceBy(-2 * HOUR);
    }
  });

  it('SP-03: a stale version is STALE_RECORD', async () => {
    const { reception, session, patient } = await hospital();
    const evening = await session({ start: '17:00', end: '21:00' });
    const appointment = await booked(reception, await patient(), evening.sessionId);
    const stale = await post(reception, `/appointments/${appointment.appointmentId}/cancel`, {
      reason: 'Patient called to cancel',
      expectedVersion: 2,
    });
    expect((await problemOf(stale)).code).toBe('STALE_RECORD');
  });

  it('offers only published sessions that have not ended, to someone who books', async () => {
    const { reception, session } = await hospital();
    const open = await session({ start: '17:00', end: '21:00' });
    await session({ start: '17:00', end: '21:00', date: '2026-11-13', publish: false });
    // Created while it runs, then listed after it has ended.
    await session({ start: '09:00', end: '11:00' });
    clock.advanceBy(2 * HOUR);
    try {
      const res = await client.call(
        reception,
        'GET',
        '/appointments/bookable-sessions?from=2026-11-12&to=2026-11-13',
      );
      expect(res.status).toBe(200);
      const { sessions } = (await dataOf(res)) as { sessions: ScheduleSession[] };
      expect(sessions.map((row) => row.sessionId)).toEqual([open.sessionId]);
    } finally {
      clock.advanceBy(-2 * HOUR);
    }
  });

  it("needs scheduling.appointment.book and hides another hospital's appointments", async () => {
    const mine = await hospital();
    const theirs = await hospital();
    const evening = await theirs.session({ start: '17:00', end: '21:00' });
    const appointment = await booked(theirs.reception, await theirs.patient(), evening.sessionId);

    const cancel = await post(mine.reception, `/appointments/${appointment.appointmentId}/cancel`, {
      reason: 'Patient called to cancel',
      expectedVersion: 1,
    });
    expect(cancel.status).toBe(404);
    const foreignSession = await book(mine.reception, await mine.patient(), evening.sessionId);
    expect((await problemOf(foreignSession)).fields?.[0]?.path).toBe('sessionId');

    const denied = await book(mine.scheduler, randomUUID(), evening.sessionId);
    expect((await problemOf(denied)).code).toBe('PERMISSION_DENIED');
  });
});
