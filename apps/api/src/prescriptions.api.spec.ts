import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  MedicineRecord,
  Prescription,
  PrescriptionPrint,
  PrescriptionLineInput,
  PrescribingTermRecord,
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
import { PharmacyModule } from '@hms/mod-pharmacy';
import { SchedulingModule } from '@hms/mod-scheduling';
import { DatabaseModule, RequestPipelineModule } from '@hms/platform';
import {
  createOpdWorld,
  dataOf,
  staffClient,
  type StaffClient,
  type StaffSession,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// The prescription over real HTTP against PostgreSQL (T-CLI-03; FR-CLI-001, FR-CLI-004..006;
// UC-CLI-01 steps 4 and 5; UC-CLI-02; C-012, FPR-06; AT-CLI-001, AT-CLI-002). "Now" is 10:00 in
// Dhaka on 2026-11-18; the evening session is that day. Names and medicines are synthetic.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const TODAY = '2026-11-18';
const clock = fixedClock(new Date('2026-11-18T04:00:00Z'));

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'r'.repeat(32),
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
    PharmacyModule.forRoot({ clock }),
  ],
})
class PrescriptionsTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

// The DOC template's clinical codes (C01 section 5).
const DOCTOR = [
  'clinical.consultation.record',
  'clinical.document.sign',
  'clinical.document.amend',
  'clinical.prescription.create',
] as const;

describe('prescription over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [PrescriptionsTestModule],
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

  async function ok<T>(res: Response, status = 200): Promise<T> {
    if (res.status !== status)
      throw new Error(`Expected ${status}, got ${res.status}: ${await res.text()}`);
    return (await dataOf(res)) as T;
  }

  const problemOf = async (res: Response) => (await res.json()) as Problem;

  /** A hospital with a catalogue, a doctor and that doctor's consultation in progress. */
  async function consulting() {
    const world = await createOpdWorld({
      prisma,
      client,
      password: PASSWORD,
      passwordHash,
      today: TODAY,
    });
    const admin = await world.staffOf(['admin.config.publish']);
    const medicine = async (body: object) =>
      ok<MedicineRecord>(await client.call(admin, 'POST', '/admin/medicines', body), 201);
    const term = async (body: object) =>
      ok<PrescribingTermRecord>(
        await client.call(admin, 'POST', '/admin/prescribing-terms', body),
        201,
      );
    const napa = await medicine({
      brandName: 'Napa',
      genericName: 'Paracetamol',
      strength: '500 mg',
      form: 'Tablet',
    });
    const amoxil = await medicine({
      brandName: 'Amoxil',
      genericName: 'Amoxicillin',
      strength: '500 mg',
      form: 'Capsule',
    });
    const oral = await term({ kind: 'ROUTE', labelEn: 'Oral' });
    const thrice = await term({ kind: 'FREQUENCY', labelEn: 'Three times daily' });
    const week = await term({ kind: 'DURATION', labelEn: '7 days' });
    // The consulting doctor, another doctor, and a doctor without the prescription code.
    const [doctor, otherDoctor, noRxDoctor] = await world.signedInDoctors([
      DOCTOR,
      DOCTOR,
      ['clinical.consultation.record', 'clinical.document.sign'],
    ]);
    if (!doctor || !otherDoctor || !noRxDoctor) throw new Error('No doctors');
    const patientId = await world.patient('Salma Begum');
    const { consultationId, visit } = await world.consultation(doctor, patientId);
    const line = (patch: Partial<PrescriptionLineInput> = {}): PrescriptionLineInput => ({
      lineId: randomUUID(),
      medicineId: napa.medicineId,
      dose: '1 tablet',
      routeTermId: oral.termId,
      frequencyTermId: thrice.termId,
      durationTermId: week.termId,
      instructionsBn: null,
      instructionsEn: 'After meals',
      quantity: 21,
      fulfilment: 'HOSPITAL_PHARMACY',
      patientNote: null,
      ...patch,
    });
    return {
      ...world,
      admin,
      doctor,
      otherDoctor,
      noRxDoctor,
      patientId,
      visit,
      consultationId,
      napa,
      amoxil,
      oral,
      thrice,
      week,
      line,
    };
  }

  const path = (consultationId: string, action?: string) => {
    const base = `/consultations/${consultationId}/prescription`;
    return action ? `${base}/${action}` : base;
  };

  const saveDraft = (
    doctor: StaffSession,
    consultationId: string,
    lines: unknown[],
    expectedVersion: number,
  ) =>
    client.call(
      doctor,
      'PUT',
      path(consultationId, 'draft'),
      { lines, expectedVersion },
      { 'Idempotency-Key': randomUUID() },
    );

  const command = (
    doctor: StaffSession,
    consultationId: string,
    action: 'sign' | 'amend' | 'discard',
    body: object,
    key: string = randomUUID(),
  ) => client.call(doctor, 'POST', path(consultationId, action), body, { 'Idempotency-Key': key });

  /** Saves the lines as the first draft and signs them. */
  async function signed(
    opd: Awaited<ReturnType<typeof consulting>>,
    lines: PrescriptionLineInput[],
  ) {
    const draft = await ok<Prescription>(
      await saveDraft(opd.doctor.session, opd.consultationId, lines, 0),
    );
    return ok<Prescription>(
      await command(opd.doctor.session, opd.consultationId, 'sign', {
        expectedVersion: draft.version,
      }),
    );
  }

  it('saves a draft that keeps the medicine and labels as written', async () => {
    const opd = await consulting();
    expect(
      await ok<Prescription>(
        await client.call(opd.doctor.session, 'GET', path(opd.consultationId)),
      ),
    ).toMatchObject({ status: 'NONE', draft: null, versions: [], version: 0 });

    const line = opd.line();
    const draft = await ok<Prescription>(
      await saveDraft(opd.doctor.session, opd.consultationId, [line], 0),
    );
    expect(draft).toMatchObject({ status: 'DRAFT', version: 1 });
    expect(draft.draft?.lines[0]).toEqual({
      ...line,
      medicine: {
        medicineId: opd.napa.medicineId,
        brandName: 'Napa',
        genericName: 'Paracetamol',
        strength: '500 mg',
        form: 'Tablet',
        nameBn: null,
      },
      route: { termId: opd.oral.termId, labelBn: null, labelEn: 'Oral' },
      frequency: { termId: opd.thrice.termId, labelBn: null, labelEn: 'Three times daily' },
      duration: { termId: opd.week.termId, labelBn: null, labelEn: '7 days' },
    });

    const stale = await saveDraft(opd.doctor.session, opd.consultationId, [line], 0);
    expect(stale.status).toBe(409);
    expect((await problemOf(stale)).code).toBe('STALE_RECORD');
  });

  it('refuses an inactive medicine and a list entry of the wrong kind on that line', async () => {
    const opd = await consulting();
    await ok(
      await client.call(opd.admin, 'PUT', `/admin/medicines/${opd.amoxil.medicineId}`, {
        brandName: 'Amoxil',
        genericName: 'Amoxicillin',
        strength: '500 mg',
        form: 'Capsule',
        active: false,
        expectedVersion: 1,
      }),
    );
    const inactive = await saveDraft(
      opd.doctor.session,
      opd.consultationId,
      [opd.line(), opd.line({ medicineId: opd.amoxil.medicineId })],
      0,
    );
    expect(inactive.status).toBe(422);
    expect((await problemOf(inactive)).fields?.map((field) => field.path)).toEqual([
      'lines.1.medicineId',
    ]);

    const wrongKind = await saveDraft(
      opd.doctor.session,
      opd.consultationId,
      [opd.line({ routeTermId: opd.week.termId })],
      0,
    );
    expect(wrongKind.status).toBe(422);
    expect((await problemOf(wrongKind)).fields?.map((field) => field.path)).toEqual([
      'lines.0.routeTermId',
    ]);
  });

  it('AT-CLI-001: signing records the lines and moves no stock and no charge', async () => {
    const opd = await consulting();
    const chargesBefore = await withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
      tx.charge.count(),
    );

    const prescription = await signed(opd, [
      opd.line(),
      opd.line({
        medicineId: opd.amoxil.medicineId,
        fulfilment: 'EXTERNAL',
        patientNote: 'Buys outside',
      }),
    ]);
    expect(prescription).toMatchObject({ status: 'SIGNED', draft: null, version: 2 });
    expect(prescription.versions).toHaveLength(1);
    expect(prescription.versions[0]).toMatchObject({ versionNo: 1, amendReason: null });

    const [lines, charges, audits, events] = await withTenant(
      prisma,
      { tenantId: opd.tenantId },
      (tx) =>
        Promise.all([
          tx.prescriptionLine.findMany({
            where: { patientId: opd.patientId },
            orderBy: { lineNo: 'asc' },
          }),
          tx.charge.count(),
          tx.auditEvent.findMany({ where: { action: 'clinical.prescription.signed' } }),
          tx.outboxEvent.findMany({ where: { eventType: 'PrescriptionSigned' } }),
        ]),
    );
    expect(
      lines.map((line) => [line.lineNo, line.medicineId, line.fulfilment, line.quantity]),
    ).toEqual([
      [1, opd.napa.medicineId, 'HOSPITAL_PHARMACY', 21],
      [2, opd.amoxil.medicineId, 'EXTERNAL', 21],
    ]);
    // FR-CLI-001: a prescription is not a dispense; nothing is charged.
    expect(charges).toBe(chargesBefore);
    expect(audits).toHaveLength(1);
    expect(events).toHaveLength(1);
    // AT-CLI-002: only the hospital-pharmacy line reaches the pharmacy.
    expect(events[0]?.payload).toMatchObject({ lineCount: 2, pharmacyLineCount: 1 });
  });

  it('signs only lines that say how to take the medicine, and only active medicines', async () => {
    const opd = await consulting();
    const empty = await ok<Prescription>(
      await saveDraft(opd.doctor.session, opd.consultationId, [], 0),
    );
    const none = await command(opd.doctor.session, opd.consultationId, 'sign', {
      expectedVersion: empty.version,
    });
    expect(none.status).toBe(422);
    expect((await problemOf(none)).fields?.map((field) => field.path)).toEqual(['lines']);

    const vague = await ok<Prescription>(
      await saveDraft(
        opd.doctor.session,
        opd.consultationId,
        [opd.line({ frequencyTermId: null, instructionsEn: null })],
        empty.version,
      ),
    );
    const unclear = await command(opd.doctor.session, opd.consultationId, 'sign', {
      expectedVersion: vague.version,
    });
    expect((await problemOf(unclear)).fields?.map((field) => field.path)).toEqual([
      'lines.0.frequencyTermId',
    ]);

    const fine = await ok<Prescription>(
      await saveDraft(opd.doctor.session, opd.consultationId, [opd.line()], vague.version),
    );
    // The medicine is withdrawn between the draft and the signature.
    await ok(
      await client.call(opd.admin, 'PUT', `/admin/medicines/${opd.napa.medicineId}`, {
        brandName: 'Napa',
        genericName: 'Paracetamol',
        strength: '500 mg',
        form: 'Tablet',
        active: false,
        expectedVersion: 1,
      }),
    );
    const withdrawn = await command(opd.doctor.session, opd.consultationId, 'sign', {
      expectedVersion: fine.version,
    });
    expect(withdrawn.status).toBe(422);
    expect((await problemOf(withdrawn)).fields?.map((field) => field.path)).toEqual([
      'lines.0.medicineId',
    ]);
  });

  it('a signed prescription keeps its words when the catalogue changes later', async () => {
    const opd = await consulting();
    await signed(opd, [opd.line()]);
    await ok(
      await client.call(opd.admin, 'PUT', `/admin/prescribing-terms/${opd.thrice.termId}`, {
        labelEn: 'TDS',
        sortOrder: 0,
        active: true,
        expectedVersion: 1,
      }),
    );
    const read = await ok<Prescription>(
      await client.call(opd.doctor.session, 'GET', path(opd.consultationId)),
    );
    expect(read.versions[0]?.content.lines[0]?.frequency?.labelEn).toBe('Three times daily');
  });

  it('UC-CLI-02: amends with a reason into v2 with its own lines; v1 stays readable', async () => {
    const opd = await consulting();
    const first = await signed(opd, [opd.line()]);

    const edit = await saveDraft(
      opd.doctor.session,
      opd.consultationId,
      [opd.line()],
      first.version,
    );
    expect(edit.status).toBe(409);
    expect((await problemOf(edit)).code).toBe('INVALID_TRANSITION');

    const noReason = await command(opd.doctor.session, opd.consultationId, 'amend', {
      reason: '',
      expectedVersion: first.version,
    });
    expect(noReason.status).toBe(422);

    const amending = await ok<Prescription>(
      await command(opd.doctor.session, opd.consultationId, 'amend', {
        reason: 'Dose too high for weight',
        expectedVersion: first.version,
      }),
    );
    expect(amending).toMatchObject({ status: 'DRAFT', amendReason: 'Dose too high for weight' });
    const changed = await ok<Prescription>(
      await saveDraft(
        opd.doctor.session,
        opd.consultationId,
        [{ ...opd.line(), dose: 'Half a tablet' }],
        amending.version,
      ),
    );
    const second = await ok<Prescription>(
      await command(opd.doctor.session, opd.consultationId, 'sign', {
        expectedVersion: changed.version,
      }),
    );
    expect(second.versions.map((version) => [version.versionNo, version.amendReason])).toEqual([
      [2, 'Dose too high for weight'],
      [1, null],
    ]);
    expect(second.versions[1]?.content.lines[0]?.dose).toBe('1 tablet');

    const lines = await withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
      tx.prescriptionLine.count({ where: { patientId: opd.patientId } }),
    );
    expect(lines).toBe(2);
  });

  it('discarding an amendment leaves the signed prescription as it was', async () => {
    const opd = await consulting();
    const first = await signed(opd, [opd.line()]);
    const amending = await ok<Prescription>(
      await command(opd.doctor.session, opd.consultationId, 'amend', {
        reason: 'Second thoughts',
        expectedVersion: first.version,
      }),
    );
    const discarded = await ok<Prescription>(
      await command(opd.doctor.session, opd.consultationId, 'discard', {
        expectedVersion: amending.version,
      }),
    );
    expect(discarded).toMatchObject({ status: 'SIGNED', draft: null, amendReason: null });
    expect(discarded.versions).toHaveLength(1);
  });

  it('a retried signature with the same key signs once', async () => {
    const opd = await consulting();
    const draft = await ok<Prescription>(
      await saveDraft(opd.doctor.session, opd.consultationId, [opd.line()], 0),
    );
    const key = randomUUID();
    const first = await ok<Prescription>(
      await command(
        opd.doctor.session,
        opd.consultationId,
        'sign',
        { expectedVersion: draft.version },
        key,
      ),
    );
    const again = await command(
      opd.doctor.session,
      opd.consultationId,
      'sign',
      { expectedVersion: draft.version },
      key,
    );
    expect(again.status).toBe(200);
    expect(again.headers.get('Idempotent-Replay')).toBe('true');
    expect(await dataOf(again)).toEqual(first);
  });

  it('keeps the note and the prescription apart on one consultation', async () => {
    const opd = await consulting();
    await signed(opd, [opd.line()]);
    const note = await client.call(
      opd.doctor.session,
      'GET',
      `/consultations/${opd.consultationId}/note`,
    );
    expect(await ok(note)).toMatchObject({ status: 'NONE', versions: [] });
  });

  it("another doctor's consultation is not found, and the code is needed", async () => {
    const opd = await consulting();
    expect(
      (await client.call(opd.otherDoctor.session, 'GET', path(opd.consultationId))).status,
    ).toBe(404);
    expect(
      (await client.call(opd.noRxDoctor.session, 'GET', path(opd.consultationId))).status,
    ).toBe(403);
  });

  it('FR-CLI-005: prints the latest signed version, audited, and changes nothing', async () => {
    const opd = await consulting();
    const print = (language: string) =>
      client.call(
        opd.doctor.session,
        'POST',
        path(opd.consultationId, 'prints'),
        { language },
        { 'Idempotency-Key': randomUUID() },
      );
    const early = await print('en');
    expect(early.status).toBe(409);
    expect((await problemOf(early)).code).toBe('INVALID_TRANSITION');

    const before = await signed(opd, [opd.line()]);
    const page = await ok<PrescriptionPrint>(await print('en'), 201);
    expect(page.versionNo).toBe(1);
    expect(page.html).toContain('Napa 500 mg Tablet');
    expect(page.html).toContain('1 tablet - Oral - Three times daily - 7 days');
    // No signed note yet: allergies are not recorded, never "no allergies" (FR-CLI-007).
    expect(page.html).toContain('Not recorded');
    expect(page.html).toMatch(/@page\s*\{\s*size:\s*A4 portrait/);

    const after = await ok<Prescription>(
      await client.call(opd.doctor.session, 'GET', path(opd.consultationId)),
    );
    expect(after).toEqual(before);
    const audits = await withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
      tx.auditEvent.count({ where: { action: 'clinical.prescription.printed' } }),
    );
    expect(audits).toBe(1);
    expect((await print('xx')).status).toBe(422);
  });

  it('never changes or deletes a signed line', async () => {
    const opd = await consulting();
    await signed(opd, [opd.line()]);
    await expect(
      withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
        tx.prescriptionLine.updateMany({
          where: { patientId: opd.patientId },
          data: { quantity: 1 },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
        tx.prescriptionLine.deleteMany({ where: { patientId: opd.patientId } }),
      ),
    ).rejects.toThrow();
  });
});
