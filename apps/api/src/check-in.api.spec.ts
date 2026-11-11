import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Appointment, PriceList, ScheduleSession, VisitCheckIn } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import { BillingModule } from '@hms/mod-billing';
import { ClinicalModule } from '@hms/mod-clinical';
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

// Check-in over real HTTP against PostgreSQL (T-VIS-01; UC-VIS-01; FR-VIS-002, FR-VIS-004,
// FR-VIS-005, FR-SCH-004, FR-BIL-010; C-035, C-041; AT-VIS-001..003). "Now" is 10:00 in Dhaka on
// 2026-11-12. Names are synthetic (AS-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const DAY = 86_400_000;
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
    BillingModule.forRoot({ clock }),
    ClinicalModule.forRoot({ clock }),
  ],
})
class CheckInTestModule {}

interface Problem {
  code: string;
}

describe('check-in over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;
  let phone = 0;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [CheckInTestModule] }).compile();
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

  const post = (session: StaffSession, path: string, body: unknown, key = randomUUID()) =>
    client.call(session, 'POST', path, body, { 'Idempotency-Key': key });

  async function ok<T>(res: Response, status = 201): Promise<T> {
    expect(res.status).toBe(status);
    return (await dataOf(res)) as T;
  }

  /**
   * A hospital with a doctor whose fee is 500.00 new and 300.00 follow-up within 14 days (unless
   * `fee` is false), and staff who schedule, book and check in.
   */
  async function hospital(fee = true) {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['patients', 'scheduling', 'clinical', 'billing']);
    const admin = await staffOf(tenantId, ['practitioner.manage', 'admin.price.publish']);
    const reception = await staffOf(tenantId, [
      'scheduling.schedule.manage',
      'scheduling.appointment.book',
      'patient.record.register',
      'visit.checkin',
    ]);
    const { practitionerId } = await ok<{ practitionerId: string }>(
      await post(admin, '/practitioners', { nameEn: 'Karim Uddin' }),
    );
    if (fee) {
      const draft = await ok<PriceList>(await post(admin, '/billing/price-lists', {}));
      const res = await client.call(
        admin,
        'PUT',
        `/billing/price-lists/${draft.priceListId}/doctor-fees/${practitionerId}`,
        { newPatientFee: '500.00', followUpFee: '300.00', followUpDays: 14, expectedVersion: 1 },
        { 'Idempotency-Key': randomUUID() },
      );
      const priced = await ok<PriceList>(res, 200);
      await ok(
        await post(admin, `/billing/price-lists/${draft.priceListId}/publish`, {
          expectedVersion: priced.version,
        }),
        200,
      );
    }

    async function session(staff: StaffSession, sessionDate = '2026-11-12') {
      const draft = await ok<ScheduleSession>(
        await post(staff, '/schedule-sessions', {
          practitionerId,
          sessionDate,
          startTime: '17:00',
          endTime: '21:00',
          capacity: 10,
        }),
      );
      return ok<ScheduleSession>(
        await post(staff, `/schedule-sessions/${draft.sessionId}/publish`, { expectedVersion: 1 }),
        200,
      );
    }

    async function patient(staff: StaffSession, nameEn = 'Salma Begum') {
      const { patientId } = await ok<{ patientId: string }>(
        await post(staff, '/patients', {
          nameEn,
          sex: 'FEMALE',
          birthDate: '1990-05-14',
          phone: `0171300${String(phone++).padStart(4, '0')}`,
          confirmNewDespiteCandidates: true,
          shownCandidateIds: [],
        }),
      );
      return patientId;
    }

    const book = async (staff: StaffSession, patientId: string, sessionId: string) =>
      ok<Appointment>(await post(staff, '/appointments', { patientId, sessionId }));

    return { tenantId, admin, reception, practitionerId, session, patient, book };
  }

  const checkIn = (staff: StaffSession, appointment: Appointment, key = randomUUID()) =>
    post(
      staff,
      '/visits/check-in',
      { appointmentId: appointment.appointmentId, expectedVersion: appointment.version },
      key,
    );

  it('AT-VIS-001: one transaction gives the visit, the serial number and the doctor-fee invoice', async () => {
    const { tenantId, reception, session, patient, book } = await hospital();
    const evening = await session(reception);
    const first = await book(reception, await patient(reception), evening.sessionId);
    const second = await book(
      reception,
      await patient(reception, 'Rahima Akter'),
      evening.sessionId,
    );

    const visit = await ok<VisitCheckIn>(await checkIn(reception, first));
    expect(visit).toMatchObject({
      appointmentId: first.appointmentId,
      kind: 'OPD_CONSULTATION',
      status: 'OPEN',
      queueNumber: 1,
      practitioner: { nameEn: 'Karim Uddin' },
      doctorFee: {
        status: 'ISSUED',
        followUp: false,
        invoice: { type: 'DOCTOR_FEE', status: 'ISSUED', total: '500.00', balance: '500.00' },
      },
    });
    const next = await ok<VisitCheckIn>(await checkIn(reception, second));
    expect(next.queueNumber).toBe(2);

    const stored = await withTenant(prisma, { tenantId }, async (tx) => ({
      appointment: await tx.appointment.findUniqueOrThrow({ where: { id: first.appointmentId } }),
      audit: await tx.auditEvent.count({ where: { action: 'visit.checked_in' } }),
      outbox: await tx.outboxEvent.count({ where: { eventType: 'VisitCheckedIn' } }),
    }));
    expect(stored).toMatchObject({ appointment: { status: 'CHECKED_IN' }, audit: 2, outbox: 2 });
  });

  it('AT-VIS-002: the same key returns the same visit; a second key is STALE_RECORD', async () => {
    const { tenantId, reception, session, patient, book } = await hospital();
    const evening = await session(reception);
    const appointment = await book(reception, await patient(reception), evening.sessionId);

    const key = randomUUID();
    const [first, again] = await Promise.all([
      checkIn(reception, appointment, key),
      checkIn(reception, appointment, key),
    ]);
    const firstVisit = await ok<VisitCheckIn>(first);
    expect((await ok<VisitCheckIn>(again)).visitId).toBe(firstVisit.visitId);

    const other = await checkIn(reception, appointment);
    expect(other.status).toBe(409);
    expect(((await other.json()) as Problem).code).toBe('STALE_RECORD');
    const visits = await withTenant(prisma, { tenantId }, (tx) =>
      tx.visit.count({ where: { appointmentId: appointment.appointmentId } }),
    );
    expect(visits).toBe(1);
  });

  it('AT-VIS-003: with no doctor fee the visit is created and the fee is POLICY_NOT_CONFIGURED', async () => {
    const { tenantId, reception, session, patient, book } = await hospital(false);
    const evening = await session(reception);
    const appointment = await book(reception, await patient(reception), evening.sessionId);
    const visit = await ok<VisitCheckIn>(await checkIn(reception, appointment));
    expect(visit).toMatchObject({ queueNumber: 1, doctorFee: { status: 'POLICY_NOT_CONFIGURED' } });
    const invoices = await withTenant(prisma, { tenantId }, (tx) =>
      tx.invoice.count({ where: { visitId: visit.visitId } }),
    );
    expect(invoices).toBe(0);
  });

  it('C-041: a return within the follow-up window is charged the follow-up fee', async () => {
    const { tenantId, reception, session, patient, book } = await hospital();
    const salma = await patient(reception);
    const today = await session(reception);
    await ok(await checkIn(reception, await book(reception, salma, today.sessionId)));

    clock.advanceBy(3 * DAY);
    try {
      // The sessions of three days ago have expired; sign in again.
      const desk = await staffOf(tenantId, [
        'scheduling.schedule.manage',
        'scheduling.appointment.book',
        'visit.checkin',
      ]);
      const later = await session(desk, '2026-11-15');
      const visit = await ok<VisitCheckIn>(
        await checkIn(desk, await book(desk, salma, later.sessionId)),
      );
      expect(visit.doctorFee).toMatchObject({
        status: 'ISSUED',
        followUp: true,
        invoice: { total: '300.00' },
      });
    } finally {
      clock.advanceBy(-3 * DAY);
    }
  });

  it('UC-VIS-01 D1, D2: refuses a cancelled appointment, another day, another hospital', async () => {
    const { tenantId, reception, session, patient, book } = await hospital();
    const evening = await session(reception);
    const cancelled = await book(reception, await patient(reception), evening.sessionId);
    await ok(
      await post(reception, `/appointments/${cancelled.appointmentId}/cancel`, {
        reason: 'Patient called',
        expectedVersion: 1,
      }),
      200,
    );
    const refused = await checkIn(reception, { ...cancelled, version: 2 });
    expect(((await refused.json()) as Problem).code).toBe('INVALID_TRANSITION');

    const tomorrow = await session(reception, '2026-11-13');
    const early = await book(
      reception,
      await patient(reception, 'Rahima Akter'),
      tomorrow.sessionId,
    );
    expect(((await (await checkIn(reception, early)).json()) as Problem).code).toBe(
      'INVALID_TRANSITION',
    );

    const other = await hospital();
    expect((await checkIn(other.reception, early)).status).toBe(404);
    const booker = await staffOf(tenantId, ['scheduling.appointment.book']);
    expect((await checkIn(booker, early)).status).toBe(403);
  });
});
