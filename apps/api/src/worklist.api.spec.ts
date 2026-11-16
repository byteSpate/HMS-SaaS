import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  Appointment,
  Consultation,
  ConsultationNote,
  NoteContent,
  DoctorWorklist,
  Invoice,
  PriceList,
  ScheduleSession,
  VisitCheckIn,
} from '@hms/contracts';
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

// The doctor worklist, consultation start and consultation note over real HTTP against PostgreSQL
// (T-CLI-01, T-CLI-02; FR-CLI-002, FR-CLI-003, FR-CLI-007; UC-CLI-01 steps 1, 2 and 5, D1, D2, D3;
// UC-CLI-02; FR-PRA-003; C-009, C-011; FPR-06; ADR-015; AT-CLI-003..006).
// "Now" is 10:00 in Dhaka on 2026-11-12; the evening session is that day. Names are synthetic.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const TODAY = '2026-11-12';
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
class WorklistTestModule {}

interface Problem {
  code: string;
}

// The DOC template's clinical codes (C01 section 5).
const DOCTOR = [
  'clinical.consultation.record',
  'clinical.document.sign',
  'clinical.document.amend',
] as const;

describe('doctor worklist over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;
  let phone = 0;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [WorklistTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    client = staffClient(`${await app.getUrl()}/api/v1`, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function accountOf(
    tenantId: string,
    permissions: Parameters<typeof grantPermissions>[3],
  ): Promise<{ userId: string; session: StaffSession }> {
    const user = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, user.id);
    if (permissions.length > 0) await grantPermissions(prisma, tenantId, membership, permissions);
    return { userId: user.id, session: await client.sessionOf(user.username, PASSWORD) };
  }

  const post = (session: StaffSession, path: string, body: unknown, key = randomUUID()) =>
    client.call(session, 'POST', path, body, { 'Idempotency-Key': key });

  async function ok<T>(res: Response, status = 201): Promise<T> {
    expect(res.status).toBe(status);
    return (await dataOf(res)) as T;
  }

  const codeOf = async (res: Response) => ((await res.json()) as Problem).code;

  /**
   * A hospital with reception and a cashier, and doctors whose fee is 500.00. Each doctor is a
   * practitioner linked to their own account (FR-PRA-003), with an evening session today.
   */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['patients', 'scheduling', 'clinical', 'billing']);
    const admin = (await accountOf(tenantId, ['practitioner.manage', 'admin.price.publish']))
      .session;
    const reception = (
      await accountOf(tenantId, [
        'scheduling.schedule.manage',
        'scheduling.appointment.book',
        'patient.record.register',
        'visit.checkin',
      ])
    ).session;
    const cashier = (
      await accountOf(tenantId, [
        'billing.cashier_session.manage',
        'billing.payment.record',
        'billing.invoice.issue',
      ])
    ).session;
    await ok(await post(cashier, '/billing/cashier-sessions', { openingFloat: '0.00' }));

    async function session(practitionerId: string, sessionDate = TODAY) {
      const draft = await ok<ScheduleSession>(
        await post(reception, '/schedule-sessions', {
          practitionerId,
          sessionDate,
          startTime: '17:00',
          endTime: '21:00',
          capacity: 10,
        }),
      );
      return ok<ScheduleSession>(
        await post(reception, `/schedule-sessions/${draft.sessionId}/publish`, {
          expectedVersion: 1,
        }),
        200,
      );
    }

    /**
     * Doctors, each with their own account and an evening session today, all priced in one
     * published price list version. `linked: false` leaves the account unlinked (FR-PRA-003).
     */
    async function doctors(
      specs: readonly {
        nameEn: string;
        linked?: boolean;
        permissions?: Parameters<typeof grantPermissions>[3];
      }[],
    ) {
      const made = [];
      for (const spec of specs) {
        const account = await accountOf(tenantId, spec.permissions ?? [...DOCTOR]);
        const { practitionerId } = await ok<{ practitionerId: string }>(
          await post(admin, '/practitioners', {
            nameEn: spec.nameEn,
            ...(spec.linked === false ? {} : { userId: account.userId }),
          }),
        );
        made.push({ practitionerId, session: account.session });
      }
      let draft = await ok<PriceList>(await post(admin, '/billing/price-lists', {}));
      for (const { practitionerId } of made) {
        draft = await ok<PriceList>(
          await client.call(
            admin,
            'PUT',
            `/billing/price-lists/${draft.priceListId}/doctor-fees/${practitionerId}`,
            {
              newPatientFee: '500.00',
              followUpFee: '300.00',
              followUpDays: 14,
              expectedVersion: draft.version,
            },
            { 'Idempotency-Key': randomUUID() },
          ),
          200,
        );
      }
      await ok(
        await post(admin, `/billing/price-lists/${draft.priceListId}/publish`, {
          expectedVersion: draft.version,
        }),
        200,
      );
      const withSessions = [];
      for (const doctor of made) {
        withSessions.push({ ...doctor, evening: await session(doctor.practitionerId) });
      }
      return withSessions;
    }

    /** One linked doctor. */
    async function doctor(nameEn: string) {
      const [made] = await doctors([{ nameEn }]);
      if (!made) throw new Error('No doctor');
      return made;
    }

    async function patient(nameEn: string) {
      const { patientId } = await ok<{ patientId: string }>(
        await post(reception, '/patients', {
          nameEn,
          sex: 'FEMALE',
          birthDate: '1990-05-14',
          phone: `0171400${String(phone++).padStart(4, '0')}`,
          confirmNewDespiteCandidates: true,
          shownCandidateIds: [],
        }),
      );
      return patientId;
    }

    const book = async (patientId: string, sessionId: string) =>
      ok<Appointment>(await post(reception, '/appointments', { patientId, sessionId }));

    const checkIn = async (appointment: Appointment) =>
      ok<VisitCheckIn>(
        await post(reception, '/visits/check-in', {
          appointmentId: appointment.appointmentId,
          expectedVersion: appointment.version,
        }),
      );

    /** The cashier takes the whole doctor fee of a checked-in visit. */
    async function payFee(visit: VisitCheckIn) {
      if (visit.doctorFee.status !== 'ISSUED') throw new Error('No fee issued');
      const invoice = await ok<Invoice>(
        await client.call(cashier, 'GET', `/billing/invoices/${visit.doctorFee.invoice.invoiceId}`),
        200,
      );
      const line = invoice.lines[0];
      if (!line) throw new Error('No line');
      await ok(
        await post(cashier, '/billing/payments', {
          patientId: visit.patientId,
          method: 'CASH',
          amount: invoice.balance,
          allocations: [{ lineId: line.lineId, amount: invoice.balance }],
        }),
      );
    }

    return {
      tenantId,
      reception,
      cashier,
      doctor,
      doctors,
      session,
      patient,
      book,
      checkIn,
      payFee,
    };
  }

  const worklistOf = async (doctor: StaffSession) =>
    ok<DoctorWorklist>(await client.call(doctor, 'GET', '/worklist'), 200);

  const start = (doctor: StaffSession, visitId: string, expectedVersion: number, key?: string) =>
    post(doctor, `/visits/${visitId}/consultation/start`, { expectedVersion }, key);

  it("AT-CLI-003: lists today's patients in queue order with their status (FR-CLI-002)", async () => {
    const opd = await hospital();
    const [karim, other] = await opd.doctors([
      { nameEn: 'Karim Uddin' },
      { nameEn: 'Nasrin Akter' },
    ]);
    if (!karim || !other) throw new Error('No doctors');
    const tomorrow = await opd.session(karim.practitionerId, '2026-11-13');

    const salma = await opd.book(await opd.patient('Salma Begum'), karim.evening.sessionId);
    const rahim = await opd.book(await opd.patient('Rahim Uddin'), karim.evening.sessionId);
    const expected = await opd.book(await opd.patient('Karim Ahmed'), karim.evening.sessionId);
    const cancelled = await opd.book(await opd.patient('Rina Das'), karim.evening.sessionId);
    await ok(
      await post(opd.reception, `/appointments/${cancelled.appointmentId}/cancel`, {
        reason: 'Patient called',
        expectedVersion: 1,
      }),
      200,
    );
    await opd.book(await opd.patient('Other Patient'), other.evening.sessionId);
    await opd.book(await opd.patient('Tomorrow Patient'), tomorrow.sessionId);

    const first = await opd.checkIn(salma);
    await opd.checkIn(rahim);
    await opd.payFee(first);

    const worklist = await worklistOf(karim.session);
    expect(worklist).toMatchObject({
      date: TODAY,
      practitioner: { practitionerId: karim.practitionerId, nameEn: 'Karim Uddin' },
    });
    expect(worklist.sessions).toHaveLength(1);
    const entries = worklist.sessions[0]?.entries ?? [];
    expect(entries.map((entry) => [entry.patient.nameEn, entry.queueNumber, entry.status])).toEqual(
      [
        ['Salma Begum', 1, 'WAITING'],
        ['Rahim Uddin', 2, 'WAITING_PAYMENT'],
        ['Karim Ahmed', null, 'EXPECTED'],
      ],
    );
    expect(entries[2]).toMatchObject({ appointmentId: expected.appointmentId, visitId: null });
  });

  it('an account not linked to a practitioner gets an empty worklist', async () => {
    const opd = await hospital();
    const [unlinked] = await opd.doctors([{ nameEn: 'Unlinked Doctor', linked: false }]);
    if (!unlinked) throw new Error('No doctor');
    await opd.book(await opd.patient('Salma Begum'), unlinked.evening.sessionId);
    expect(await worklistOf(unlinked.session)).toEqual({
      date: TODAY,
      practitioner: null,
      sessions: [],
    });
  });

  it('ADR-015: answers 304 while nothing changed, and new data once a fee is paid', async () => {
    const opd = await hospital();
    const karim = await opd.doctor('Karim Uddin');
    const visit = await opd.checkIn(
      await opd.book(await opd.patient('Salma Begum'), karim.evening.sessionId),
    );

    const first = await client.call(karim.session, 'GET', '/worklist');
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    const tag = first.headers.get('etag');
    expect(tag).toMatch(/^".+"$/);

    const unchanged = await client.call(karim.session, 'GET', '/worklist', undefined, {
      'If-None-Match': tag ?? '',
    });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe('');

    await opd.payFee(visit);
    const changed = await client.call(karim.session, 'GET', '/worklist', undefined, {
      'If-None-Match': tag ?? '',
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(tag);
    const entries = ((await dataOf(changed)) as DoctorWorklist).sessions[0]?.entries;
    expect(entries?.[0]?.status).toBe('WAITING');
  });

  it('AT-CLI-004: an unpaid fee is PAYMENT_NOT_ELIGIBLE; once paid the doctor starts it', async () => {
    const opd = await hospital();
    const karim = await opd.doctor('Karim Uddin');
    const visit = await opd.checkIn(
      await opd.book(await opd.patient('Salma Begum'), karim.evening.sessionId),
    );

    const unpaid = await start(karim.session, visit.visitId, 1);
    expect(unpaid.status).toBe(409);
    expect(await codeOf(unpaid)).toBe('PAYMENT_NOT_ELIGIBLE');

    await opd.payFee(visit);
    const key = randomUUID();
    const started = await ok<Consultation>(await start(karim.session, visit.visitId, 1, key));
    expect(started).toMatchObject({
      visitId: visit.visitId,
      status: 'IN_CONSULTATION',
      patient: { nameEn: 'Salma Begum' },
      version: 1,
    });
    // SP-01: a repeat with the same key is the same consultation, not an error.
    const again = await ok<Consultation>(await start(karim.session, visit.visitId, 1, key));
    expect(again.consultationId).toBe(started.consultationId);

    const [entry] = (await worklistOf(karim.session)).sessions[0]?.entries ?? [];
    expect(entry).toMatchObject({
      status: 'IN_CONSULTATION',
      consultationId: started.consultationId,
      visitVersion: 2,
    });
    const read = await ok<Consultation>(
      await client.call(karim.session, 'GET', `/consultations/${started.consultationId}`),
      200,
    );
    expect(read.consultationId).toBe(started.consultationId);

    const stored = await withTenant(prisma, { tenantId: opd.tenantId }, async (tx) => ({
      consultations: await tx.consultation.count({ where: { visitId: visit.visitId } }),
      audit: await tx.auditEvent.count({ where: { action: 'clinical.consultation.started' } }),
      outbox: await tx.outboxEvent.count({ where: { eventType: 'ConsultationStarted' } }),
    }));
    expect(stored).toEqual({ consultations: 1, audit: 1, outbox: 1 });
  });

  it('SP-03: a second start is STALE_RECORD on the old version, INVALID_TRANSITION after', async () => {
    const opd = await hospital();
    const karim = await opd.doctor('Karim Uddin');
    const visit = await opd.checkIn(
      await opd.book(await opd.patient('Salma Begum'), karim.evening.sessionId),
    );
    await opd.payFee(visit);

    const [first, second] = await Promise.all([
      start(karim.session, visit.visitId, 1),
      start(karim.session, visit.visitId, 1),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const loser = first.status === 409 ? first : second;
    expect(await codeOf(loser)).toBe('STALE_RECORD');

    const reloaded = await start(karim.session, visit.visitId, 2);
    expect(reloaded.status).toBe(409);
    expect(await codeOf(reloaded)).toBe('INVALID_TRANSITION');
  });

  it("only the visit's doctor; no doctor permission, another hospital or doctor is refused", async () => {
    const opd = await hospital();
    const [karim, nasrin] = await opd.doctors([
      { nameEn: 'Karim Uddin' },
      { nameEn: 'Nasrin Akter' },
    ]);
    if (!karim || !nasrin) throw new Error('No doctors');
    const visit = await opd.checkIn(
      await opd.book(await opd.patient('Salma Begum'), karim.evening.sessionId),
    );
    await opd.payFee(visit);

    const otherDoctor = await start(nasrin.session, visit.visitId, 1);
    expect(otherDoctor.status).toBe(403);
    // C-009: the cashier has no consultation permission.
    expect((await start(opd.cashier, visit.visitId, 1)).status).toBe(403);
    expect((await client.call(opd.cashier, 'GET', '/worklist')).status).toBe(403);
    const elsewhere = await hospital();
    const foreign = await elsewhere.doctor('Foreign Doctor');
    expect((await start(foreign.session, visit.visitId, 1)).status).toBe(404);

    const started = await ok<Consultation>(await start(karim.session, visit.visitId, 1));
    const notTheirs = await client.call(
      nasrin.session,
      'GET',
      `/consultations/${started.consultationId}`,
    );
    expect(notTheirs.status).toBe(404);
  });

  it('the app cannot delete a consultation or move it to another visit', async () => {
    const opd = await hospital();
    const karim = await opd.doctor('Karim Uddin');
    const visit = await opd.checkIn(
      await opd.book(await opd.patient('Salma Begum'), karim.evening.sessionId),
    );
    await opd.payFee(visit);
    const started = await ok<Consultation>(await start(karim.session, visit.visitId, 1));
    await expect(
      withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
        tx.consultation.delete({ where: { id: started.consultationId } }),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
        tx.consultation.update({
          where: { id: started.consultationId },
          data: { visitId: randomUUID() },
        }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  describe('consultation note (T-CLI-02)', () => {
    const content = (patch: Partial<NoteContent> = {}): NoteContent => ({
      complaint: 'Fever for three days',
      history: null,
      examination: 'Temperature 38.5',
      assessment: 'Viral fever',
      advice: null,
      allergies: { status: 'KNOWN_ALLERGIES', items: ['Penicillin'] },
      ...patch,
    });

    /**
     * A paid, started consultation of Karim (the DOC codes unless `permissions`), and a second
     * doctor of the same hospital, priced in the same price list.
     */
    async function started(permissions?: Parameters<typeof grantPermissions>[3]) {
      const opd = await hospital();
      const [doctor, other] = await opd.doctors([
        { nameEn: 'Karim Uddin', ...(permissions ? { permissions } : {}) },
        { nameEn: 'Nasrin Akter' },
      ]);
      if (!doctor || !other) throw new Error('No doctors');
      const visit = await opd.checkIn(
        await opd.book(await opd.patient('Salma Begum'), doctor.evening.sessionId),
      );
      await opd.payFee(visit);
      const consultation = await ok<Consultation>(await start(doctor.session, visit.visitId, 1));
      return { opd, doctor, other, consultationId: consultation.consultationId };
    }

    const notePath = (id: string, action = '') => `/consultations/${id}/note${action}`;
    const readNote = async (doctor: StaffSession, id: string) =>
      ok<ConsultationNote>(await client.call(doctor, 'GET', notePath(id)), 200);
    const saveDraft = (doctor: StaffSession, id: string, body: unknown) =>
      client.call(doctor, 'PUT', notePath(id, '/draft'), body, { 'Idempotency-Key': randomUUID() });
    const command = (doctor: StaffSession, id: string, action: string, body: unknown) =>
      post(doctor, notePath(id, `/${action}`), body);

    it('AT-CLI-005: drafts autosave, sign makes v1 and the consultation CONSULTED', async () => {
      const { opd, doctor, consultationId } = await started();
      expect(await readNote(doctor.session, consultationId)).toMatchObject({
        status: 'NONE',
        draft: null,
        versions: [],
        version: 0,
      });

      const first = await ok<ConsultationNote>(
        await saveDraft(doctor.session, consultationId, {
          content: content({ assessment: null }),
          expectedVersion: 0,
        }),
        200,
      );
      expect(first).toMatchObject({ status: 'DRAFT', version: 1 });
      const second = await ok<ConsultationNote>(
        await saveDraft(doctor.session, consultationId, {
          content: content(),
          expectedVersion: 1,
        }),
        200,
      );
      expect(second.draft?.assessment).toBe('Viral fever');

      const signed = await ok<ConsultationNote>(
        await command(doctor.session, consultationId, 'sign', { expectedVersion: 2 }),
        200,
      );
      expect(signed).toMatchObject({ status: 'SIGNED', draft: null, version: 3 });
      expect(signed.versions).toEqual([
        expect.objectContaining({ versionNo: 1, content: content(), amendReason: null }),
      ]);
      const [entry] = (await worklistOf(doctor.session)).sessions[0]?.entries ?? [];
      expect(entry?.status).toBe('CONSULTED');

      // A signed note is not edited without an amendment.
      const edit = await saveDraft(doctor.session, consultationId, {
        content: content({ advice: 'Rest' }),
        expectedVersion: 3,
      });
      expect(edit.status).toBe(409);
      expect(await codeOf(edit)).toBe('INVALID_TRANSITION');
      const stored = await withTenant(prisma, { tenantId: opd.tenantId }, async (tx) => ({
        audit: await tx.auditEvent.count({ where: { action: 'clinical.note.signed' } }),
        outbox: await tx.outboxEvent.count({ where: { eventType: 'ConsultationSigned' } }),
      }));
      expect(stored).toEqual({ audit: 1, outbox: 1 });
    });

    it('AT-CLI-006: an amendment needs a reason and signs as v2 linked to v1', async () => {
      const { opd, doctor, consultationId } = await started();
      await ok(
        await saveDraft(doctor.session, consultationId, { content: content(), expectedVersion: 0 }),
        200,
      );
      await ok(await command(doctor.session, consultationId, 'sign', { expectedVersion: 1 }), 200);

      const noReason = await command(doctor.session, consultationId, 'amend', {
        reason: '',
        expectedVersion: 2,
      });
      expect(noReason.status).toBe(422);
      const amending = await ok<ConsultationNote>(
        await command(doctor.session, consultationId, 'amend', {
          reason: 'Allergy was recorded wrongly',
          expectedVersion: 2,
        }),
        200,
      );
      expect(amending).toMatchObject({
        status: 'DRAFT',
        draft: content(),
        amendReason: 'Allergy was recorded wrongly',
      });
      const corrected = content({ allergies: { status: 'NO_KNOWN_ALLERGIES' } });
      await ok(
        await saveDraft(doctor.session, consultationId, {
          content: corrected,
          expectedVersion: 3,
        }),
        200,
      );
      const signed = await ok<ConsultationNote>(
        await command(doctor.session, consultationId, 'sign', { expectedVersion: 4 }),
        200,
      );
      expect(signed.versions.map((version) => [version.versionNo, version.amendReason])).toEqual([
        [2, 'Allergy was recorded wrongly'],
        [1, null],
      ]);
      // v1 stays readable as it was signed.
      expect(signed.versions[1]?.content).toEqual(content());
      expect(signed.versions[0]?.content).toEqual(corrected);

      const rows = await withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
        tx.clinicalDocumentVersion.findMany({ orderBy: { versionNo: 'asc' } }),
      );
      expect(rows[1]?.amendsVersionId).toBe(rows[0]?.id);
    });

    it('FR-CLI-003: discards a draft; an amendment discarded leaves the signed note', async () => {
      const { doctor, consultationId } = await started();
      await ok(
        await saveDraft(doctor.session, consultationId, { content: content(), expectedVersion: 0 }),
        200,
      );
      const discarded = await ok<ConsultationNote>(
        await command(doctor.session, consultationId, 'discard', { expectedVersion: 1 }),
        200,
      );
      expect(discarded).toMatchObject({ status: 'NONE', draft: null, version: 2 });

      await ok(
        await saveDraft(doctor.session, consultationId, { content: content(), expectedVersion: 2 }),
        200,
      );
      await ok(await command(doctor.session, consultationId, 'sign', { expectedVersion: 3 }), 200);
      await ok(
        await command(doctor.session, consultationId, 'amend', {
          reason: 'Add the advice',
          expectedVersion: 4,
        }),
        200,
      );
      const kept = await ok<ConsultationNote>(
        await command(doctor.session, consultationId, 'discard', { expectedVersion: 5 }),
        200,
      );
      expect(kept).toMatchObject({ status: 'SIGNED', draft: null, amendReason: null });
      expect(kept.versions).toHaveLength(1);
    });

    it('SP-03 and sign rules: a stale draft is STALE_RECORD, an empty note cannot be signed', async () => {
      const { doctor, consultationId } = await started();
      const empty = content({ complaint: null, examination: null, assessment: null });
      await ok(
        await saveDraft(doctor.session, consultationId, { content: empty, expectedVersion: 0 }),
        200,
      );
      const stale = await saveDraft(doctor.session, consultationId, {
        content: content(),
        expectedVersion: 0,
      });
      expect(stale.status).toBe(409);
      expect(await codeOf(stale)).toBe('STALE_RECORD');
      const unsignable = await command(doctor.session, consultationId, 'sign', {
        expectedVersion: 1,
      });
      expect(unsignable.status).toBe(422);
    });

    it('UC-CLI-01 D2: drafting without the sign permission; another doctor sees nothing', async () => {
      const { doctor, other, consultationId } = await started(['clinical.consultation.record']);
      await ok(
        await saveDraft(doctor.session, consultationId, { content: content(), expectedVersion: 0 }),
        200,
      );
      const refused = await command(doctor.session, consultationId, 'sign', { expectedVersion: 1 });
      expect(refused.status).toBe(403);

      expect((await client.call(other.session, 'GET', notePath(consultationId))).status).toBe(404);
      const write = await saveDraft(other.session, consultationId, {
        content: content(),
        expectedVersion: 1,
      });
      expect(write.status).toBe(404);
    });

    it('FPR-06: the app cannot change or delete a signed version', async () => {
      const { opd, doctor, consultationId } = await started();
      await ok(
        await saveDraft(doctor.session, consultationId, { content: content(), expectedVersion: 0 }),
        200,
      );
      await ok(await command(doctor.session, consultationId, 'sign', { expectedVersion: 1 }), 200);
      const [version] = await withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
        tx.clinicalDocumentVersion.findMany(),
      );
      if (!version) throw new Error('No version');
      await expect(
        withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
          tx.clinicalDocumentVersion.update({
            where: { id: version.id },
            data: { amendReason: 'x' },
          }),
        ),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
          tx.clinicalDocumentVersion.delete({ where: { id: version.id } }),
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });
});
