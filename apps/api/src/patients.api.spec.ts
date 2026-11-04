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
import { PatientsModule } from '@hms/mod-patients';
import { DatabaseModule, publishPolicyVersion, RequestPipelineModule } from '@hms/platform';
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

// Patient registration over real HTTP against PostgreSQL (T-PAT-01; FR-PAT-001, -002, -005, -006,
// -009, -011; C-033, C-034; AT-PAT-001..006). Names are synthetic (AS-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
// 06:00 UTC is noon in Dhaka, so the hospital's date is 2026-11-04 (age-only registration).
const clock = fixedClock(new Date('2026-11-04T06:00:00Z'));

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'p'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
    PatientsModule.forRoot({ clock, nidKey: Buffer.alloc(32, 9) }),
  ],
})
class PatientsTestModule {}

interface Problem {
  code: string;
  reason?: string;
  candidateIds?: string[];
  fields?: { path: string }[];
}

describe('patient registration over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [PatientsTestModule] }).compile();
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

  /** A hospital with the patients module and a receptionist. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['patients']);
    const session = await staffOf(tenantId, ['patient.record.search', 'patient.record.register']);
    return { tenantId, session };
  }

  const salma = () => ({
    nameEn: 'Salma Begum',
    sex: 'FEMALE',
    birthDate: '1990-05-14',
    phone: '01711000001',
    confirmNewDespiteCandidates: false,
    shownCandidateIds: [],
  });

  /** The body without one field, to test that the field is required. */
  const without = (body: Record<string, unknown>, field: string) =>
    Object.fromEntries(Object.entries(body).filter(([key]) => key !== field));

  const register = (session: StaffSession, body: unknown, key: string = randomUUID()) =>
    client.call(session, 'POST', '/patients', body, { 'Idempotency-Key': key });

  const candidates = (session: StaffSession, body: unknown) =>
    client.call(session, 'POST', '/patients/duplicate-candidates', body);

  const patients = (tenantId: string) =>
    withTenant(prisma, { tenantId }, (tx) => tx.patient.findMany({ orderBy: { mrn: 'asc' } }));

  it('AT-PAT-001: registers without NID, with a server MRN, an audit event and an outbox event', async () => {
    const { tenantId, session } = await hospital();
    const res = await register(session, salma());
    expect(res.status).toBe(201);
    const created = (await dataOf(res)) as { patientId: string; mrn: string; version: number };
    expect(created).toMatchObject({ mrn: 'MRN-000001', version: 1 });

    const [row] = await patients(tenantId);
    expect(row).toMatchObject({
      id: created.patientId,
      nameEn: 'Salma Begum',
      nameBn: null,
      sex: 'FEMALE',
      birthDatePrecision: 'EXACT',
      birthYear: 1990,
      phoneNormalized: '01711000001',
      identityStatus: 'CONFIRMED',
    });
    const [audit, outbox] = await withTenant(prisma, { tenantId }, (tx) =>
      Promise.all([
        tx.auditEvent.findMany({ where: { action: 'patient.registered' } }),
        tx.outboxEvent.findMany({ where: { eventType: 'PatientRegistered', tenantId } }),
      ]),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ targetType: 'patient', targetId: created.patientId });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.payload).toEqual({ patientId: created.patientId });
  });

  it('C-033: numbers with the hospital prefix once it is published', async () => {
    const { tenantId, session } = await hospital();
    // In force before the API's fixed clock, which may be earlier than the real time.
    const yesterday = new Date(clock.now().getTime() - 86_400_000);
    await withTenant(prisma, { tenantId }, (tx) =>
      publishPolicyVersion(tx, {
        tenantId,
        correlationId: randomUUID(),
        policyKey: 'numbering',
        body: { mrnPrefix: 'SMH' },
        effectiveFrom: yesterday,
        reason: 'First setup',
        now: yesterday,
      }),
    );
    const first = await register(session, salma());
    const second = await register(session, {
      ...salma(),
      nameEn: 'Rahima Khatun',
      birthDate: '1975-01-02',
      phone: '01811000002',
    });
    expect((await dataOf(first)).mrn).toBe('SMH-000001');
    expect((await dataOf(second)).mrn).toBe('SMH-000002');
  });

  it('AT-PAT-006: an age only gives no birth date, an estimated birth year and the reported age', async () => {
    const { tenantId, session } = await hospital();
    const res = await register(session, { ...without(salma(), 'birthDate'), reportedAgeYears: 40 });
    expect(res.status).toBe(201);
    const [row] = await patients(tenantId);
    expect(row).toMatchObject({
      birthDate: null,
      birthDatePrecision: 'YEAR_ESTIMATED',
      reportedAgeYears: 40,
      birthYear: 1986,
    });
    expect(row?.reportedAgeOn?.toISOString().slice(0, 10)).toBe('2026-11-04');
  });

  it('FR-PAT-003: finds a candidate by the same phone written another way', async () => {
    const { session } = await hospital();
    const karim = await register(session, {
      ...salma(),
      nameEn: 'Karim Ahmed',
      sex: 'MALE',
      phone: '01700000001',
    });
    const karimId = (await dataOf(karim)).patientId as string;

    for (const phone of [
      '+880 1700-000001',
      '\u09e6\u09e7\u09ed\u09e6\u09e6\u09e6\u09e6\u09e6\u09e6\u09e6\u09e7',
    ]) {
      const res = await candidates(session, {
        nameEn: 'Someone Else',
        sex: 'FEMALE',
        reportedAgeYears: 70,
        phone,
      });
      expect(res.status).toBe(200);
      const found = (await dataOf(res)).candidates as { patientId: string; reasons: string[] }[];
      expect(found).toEqual([
        expect.objectContaining({ patientId: karimId, reasons: ['SAME_PHONE'] }),
      ]);
    }
  });

  it('AT-PAT-002/003: refuses until the receptionist confirms with every candidate shown', async () => {
    const { tenantId, session } = await hospital();
    const first = await register(session, salma());
    const firstId = (await dataOf(first)).patientId as string;
    const twin = { ...salma(), nameEn: 'Salma Begom', phone: null };

    const refused = await register(session, twin);
    expect(refused.status).toBe(422);
    const problem = (await refused.json()) as Problem;
    expect(problem).toMatchObject({
      code: 'VALIDATION_FAILED',
      reason: 'DUPLICATE_CANDIDATES_PRESENT',
      candidateIds: [firstId],
    });

    const unseen = await register(session, { ...twin, confirmNewDespiteCandidates: true });
    expect(unseen.status).toBe(422);

    const confirmed = await register(session, {
      ...twin,
      confirmNewDespiteCandidates: true,
      shownCandidateIds: [firstId],
    });
    expect(confirmed.status).toBe(201);
    expect(await patients(tenantId)).toHaveLength(2);
    const confirmedId = (await dataOf(confirmed)).patientId as string;
    const audit = await withTenant(prisma, { tenantId }, (tx) =>
      tx.auditEvent.findFirstOrThrow({
        where: { action: 'patient.registered', targetId: confirmedId },
      }),
    );
    expect(audit.details).toMatchObject({
      confirmedDespiteCandidates: true,
      shownCandidateIds: firstId,
    });
  });

  it('FR-PAT-011: a similar name matches only with the same sex and a near birth year', async () => {
    const { session } = await hospital();
    const first = await register(session, {
      ...salma(),
      nameBn: '\u09b8\u09be\u09b2\u09ae\u09be \u09ac\u09c7\u0997\u09ae',
    });
    const firstId = (await dataOf(first)).patientId as string;
    const probe = { nameEn: 'Salma Begom', sex: 'FEMALE', birthDate: '1992-02-01', phone: null };

    const near = await dataOf(await candidates(session, probe));
    expect(near.candidates).toEqual([
      expect.objectContaining({ patientId: firstId, reasons: ['SIMILAR_NAME'], mrn: 'MRN-000001' }),
    ]);
    const bangla = await dataOf(
      await candidates(session, {
        ...probe,
        nameEn: undefined,
        nameBn: '\u09b8\u09be\u09b2\u09ae\u09be \u09ac\u09c7\u0997\u09ae',
      }),
    );
    expect(bangla.candidates).toHaveLength(1);
    const otherSex = await dataOf(await candidates(session, { ...probe, sex: 'MALE' }));
    expect(otherSex.candidates).toEqual([]);
    const tooFar = await dataOf(await candidates(session, { ...probe, birthDate: '1999-01-01' }));
    expect(tooFar.candidates).toEqual([]);
  });

  it('AT-PAT-005: the same idempotency key twice creates one patient', async () => {
    const { tenantId, session } = await hospital();
    const key = randomUUID();
    const first = await register(session, salma(), key);
    const again = await register(session, salma(), key);
    expect(again.status).toBe(201);
    expect(again.headers.get('Idempotent-Replay')).toBe('true');
    expect(await dataOf(again)).toEqual(await dataOf(first));
    expect(await patients(tenantId)).toHaveLength(1);
  });

  it('AT-PAT-004: needs the register permission and the patients module', async () => {
    const { tenantId } = await hospital();
    const searchOnly = await staffOf(tenantId, ['patient.record.search']);
    const denied = await register(searchOnly, salma());
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as Problem).code).toBe('PERMISSION_DENIED');

    const noModule = await seedTenant(prisma);
    const receptionist = await staffOf(noModule, ['patient.record.register']);
    const missing = await register(receptionist, salma());
    expect(((await missing.json()) as Problem).code).toBe('ENTITLEMENT_MISSING');
    expect(await patients(tenantId)).toHaveLength(0);
  });

  it('C-034 / FR-PAT-005: checks the required fields', async () => {
    const { tenantId, session } = await hospital();
    const fieldsOf = async (body: unknown) => {
      const res = await register(session, body);
      expect(res.status).toBe(422);
      return ((await res.json()) as Problem).fields?.map((field) => field.path);
    };

    expect(await fieldsOf(without(salma(), 'nameEn'))).toContain('nameEn');
    expect(await fieldsOf({ ...salma(), reportedAgeYears: 30 })).toContain('reportedAgeYears');
    expect(await fieldsOf(without(salma(), 'birthDate'))).toContain('birthDate');
    expect(await fieldsOf({ ...salma(), birthDate: '2030-01-01' })).toContain('birthDate');
    expect(await fieldsOf({ ...salma(), phone: '12345' })).toContain('phone');
    expect(await fieldsOf(without(salma(), 'phone'))).toContain('phone');
    expect(await patients(tenantId)).toHaveLength(0);

    // A patient without a mobile number is registered with phone null (C-034).
    const res = await register(session, { ...salma(), phone: null });
    expect(res.status).toBe(201);
  });

  it('keeps hospitals apart: no candidates and no shared numbers across hospitals', async () => {
    const mine = await hospital();
    const other = await hospital();
    await register(mine.session, salma());
    const found = await dataOf(await candidates(other.session, salma()));
    expect(found.candidates).toEqual([]);
    const theirs = await register(other.session, salma());
    expect((await dataOf(theirs)).mrn).toBe('MRN-000001');
  });

  describe('search (T-PAT-02)', () => {
    let next = 0;
    /** A patient written straight to the table, so tests need no duplicate review. */
    async function seedPatient(tenantId: string, fields: Record<string, unknown>) {
      next += 1;
      return withTenant(prisma, { tenantId }, (tx) =>
        tx.patient.create({
          data: {
            tenantId,
            mrn: `MRN-${String(next).padStart(6, '0')}`,
            sex: 'MALE',
            birthDate: new Date('1990-05-14T00:00:00Z'),
            birthDatePrecision: 'EXACT',
            birthYear: 1990,
            createdBy: randomUUID(),
            ...fields,
          },
        }),
      );
    }

    const search = async (session: StaffSession, term: string) => {
      const res = await client.call(session, 'POST', '/patients/search', { term });
      return { status: res.status, body: (await res.json()) as { data?: SearchResult } & Problem };
    };

    interface SearchResult {
      matchedBy: string;
      patients: {
        patientId: string;
        mrn: string;
        ageYears: number | null;
        ageEstimated: boolean;
        phone: string | null;
      }[];
    }

    it('AT-PAT-007: every spelling of a phone number finds the same patient', async () => {
      const { tenantId, session } = await hospital();
      const karim = await seedPatient(tenantId, {
        nameEn: 'Karim Ahmed',
        phoneRaw: '01700-000001',
        phoneNormalized: '01700000001',
      });
      for (const term of [
        '01700-000001',
        '+880 1700 000001',
        '\u09e6\u09e7\u09ed\u09e6\u09e6\u09e6\u09e6\u09e6\u09e6\u09e6\u09e7',
      ]) {
        const { status, body } = await search(session, term);
        expect(status).toBe(200);
        expect(body.data?.matchedBy).toBe('PHONE');
        expect(body.data?.patients.map((patient) => patient.patientId)).toEqual([karim.id]);
      }
    });

    it('finds by MRN in any case or by its number, with the banner age', async () => {
      const { tenantId, session } = await hospital();
      const karim = await seedPatient(tenantId, { nameEn: 'Karim Ahmed', mrn: 'SMH-000042' });
      for (const term of ['smh-000042', '42']) {
        const { body } = await search(session, term);
        expect(body.data?.matchedBy).toBe('MRN');
        expect(body.data?.patients).toEqual([
          expect.objectContaining({ patientId: karim.id, ageYears: 36, ageEstimated: false }),
        ]);
      }
    });

    it('finds partial and misspelt names in both scripts, closest first', async () => {
      const { tenantId, session } = await hospital();
      const karim = await seedPatient(tenantId, { nameEn: 'Karim Ahmed' });
      const karima = await seedPatient(tenantId, { nameEn: 'Karima Begum', sex: 'FEMALE' });
      await seedPatient(tenantId, { nameEn: 'Rahim Uddin' });
      const bangla = await seedPatient(tenantId, {
        nameBn: '\u09b8\u09be\u09b2\u09ae\u09be \u09ac\u09c7\u0997\u09ae',
        sex: 'FEMALE',
      });

      const partial = await search(session, 'karim');
      expect(partial.body.data?.matchedBy).toBe('NAME');
      expect(partial.body.data?.patients.map((patient) => patient.patientId)).toEqual([
        karim.id,
        karima.id,
      ]);
      const misspelt = await search(session, 'Kareem Ahmed');
      expect(misspelt.body.data?.patients[0]?.patientId).toBe(karim.id);
      const inBangla = await search(session, '\u09b8\u09be\u09b2\u09ae\u09be');
      expect(inBangla.body.data?.patients.map((patient) => patient.patientId)).toEqual([bangla.id]);
    });

    it('marks an age from a reported age as estimated', async () => {
      const { tenantId, session } = await hospital();
      await seedPatient(tenantId, {
        nameEn: 'Abul Kashem',
        birthDate: null,
        birthDatePrecision: 'YEAR_ESTIMATED',
        birthYear: 1966,
        reportedAgeYears: 60,
        reportedAgeOn: new Date('2026-01-10T00:00:00Z'),
      });
      const { body } = await search(session, 'Abul');
      expect(body.data?.patients[0]).toMatchObject({ ageYears: 60, ageEstimated: true });
    });

    it('returns at most 20 rows', async () => {
      const { tenantId, session } = await hospital();
      for (let index = 0; index < 22; index += 1) {
        await seedPatient(tenantId, { nameEn: `Common Name ${index}` });
      }
      const { body } = await search(session, 'Common Name');
      expect(body.data?.patients).toHaveLength(20);
    });

    it('needs the search permission only, and keeps hospitals apart', async () => {
      const mine = await hospital();
      const other = await hospital();
      await seedPatient(mine.tenantId, { nameEn: 'Karim Ahmed' });
      const doctor = await staffOf(mine.tenantId, ['patient.record.search']);
      expect((await search(doctor, 'Karim')).body.data?.patients).toHaveLength(1);
      const nobody = await staffOf(mine.tenantId, []);
      expect((await search(nobody, 'Karim')).status).toBe(403);
      expect((await search(other.session, 'Karim')).body.data?.patients).toEqual([]);
    });

    it('the name search function sees only the session hospital, and nothing without one', async () => {
      const mine = await hospital();
      const other = await hospital();
      await seedPatient(mine.tenantId, { nameEn: 'Karim Ahmed' });
      const countIn = async (tenantId?: string) => {
        const query = (tx: PrismaClient | Parameters<Parameters<typeof withTenant>[2]>[0]) =>
          tx.$queryRaw<{ count: bigint }[]>`
            SELECT count(*) FROM hms.search_patients_by_name('Karim Ahmed')`;
        const rows = tenantId ? await withTenant(prisma, { tenantId }, query) : await query(prisma);
        return Number(rows[0]?.count);
      };
      expect(await countIn(mine.tenantId)).toBe(1);
      expect(await countIn(other.tenantId)).toBe(0);
      // Fails closed: no hospital in the session means no rows, not every hospital's rows.
      expect(await countIn()).toBe(0);
    });

    it('refuses a term that is too short to search', async () => {
      const { session } = await hospital();
      const short = await search(session, 'ab');
      expect(short.status).toBe(422);
      expect(short.body.fields?.map((field) => field.path)).toEqual(['term']);
      expect((await search(session, '   ')).status).toBe(422);
    });
  });

  describe('NID (T-PAT-03)', () => {
    const NID = '1234567890';
    const withNid = () => ({ ...salma(), nid: '123 456 7890' });
    const reveal = (session: StaffSession, patientId: string) =>
      client.call(session, 'POST', `/patients/${patientId}/nid/reveal`);

    it('AT-PAT-009: stores the NID sealed and shows only its last four digits', async () => {
      const { tenantId, session } = await hospital();
      const res = await register(session, withNid());
      expect(res.status).toBe(201);
      const { patientId } = (await dataOf(res)) as { patientId: string };

      const stored = await withTenant(prisma, { tenantId }, (tx) =>
        tx.patientIdentifier.findUniqueOrThrow({
          where: { tenantId_patientId_kind: { tenantId, patientId, kind: 'NID' } },
        }),
      );
      expect(stored.valueLast4).toBe('7890');
      expect(Buffer.from(stored.valueCiphertext).includes(Buffer.from(NID))).toBe(false);

      const found = await client.call(session, 'POST', '/patients/search', { term: '1234567890' });
      const text = await found.text();
      expect(text).not.toContain(NID);
      const body = JSON.parse(text) as { data: { matchedBy: string; patients: unknown[] } };
      expect(body.data.matchedBy).toBe('NID');
      expect(body.data.patients).toEqual([
        expect.objectContaining({ patientId, nidLast4: '7890' }),
      ]);
    });

    it('reveals the full NID only with patient.sensitive.view, and audits it', async () => {
      const { tenantId, session } = await hospital();
      const { patientId } = (await dataOf(await register(session, withNid()))) as {
        patientId: string;
      };

      const refused = await reveal(session, patientId);
      expect(refused.status).toBe(403);
      expect(await refused.text()).not.toContain(NID);

      const viewer = await staffOf(tenantId, ['patient.sensitive.view']);
      const shown = await reveal(viewer, patientId);
      expect(shown.status).toBe(200);
      expect(shown.headers.get('cache-control')).toBe('no-store');
      expect(await dataOf(shown)).toEqual({ nid: NID });
      const audit = await withTenant(prisma, { tenantId }, (tx) =>
        tx.auditEvent.findMany({ where: { action: 'patient.nid.revealed', targetId: patientId } }),
      );
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit[0])).not.toContain(NID);
    });

    it('answers NOT_FOUND without an NID, for another hospital, and for a bad ID', async () => {
      const mine = await hospital();
      const other = await hospital();
      const viewer = await staffOf(mine.tenantId, ['patient.sensitive.view']);
      const plain = (await dataOf(await register(mine.session, salma()))) as { patientId: string };
      expect((await reveal(viewer, plain.patientId)).status).toBe(404);
      const theirs = (await dataOf(await register(other.session, withNid()))) as {
        patientId: string;
      };
      expect((await reveal(viewer, theirs.patientId)).status).toBe(404);
      expect((await reveal(viewer, 'not-a-uuid')).status).toBe(404);
    });

    it('FR-PAT-011: the same NID is a duplicate candidate', async () => {
      const { session } = await hospital();
      const first = (await dataOf(await register(session, withNid()))) as { patientId: string };
      const res = await candidates(session, {
        nameEn: 'Someone Different',
        sex: 'MALE',
        reportedAgeYears: 70,
        phone: null,
        nid: '1234-567-890',
      });
      expect((await dataOf(res)).candidates).toEqual([
        expect.objectContaining({ patientId: first.patientId, reasons: ['SAME_NID'] }),
      ]);
    });

    it('refuses an NID that is not 10, 13 or 17 digits', async () => {
      const { session } = await hospital();
      const res = await register(session, { ...salma(), nid: '12345' });
      expect(res.status).toBe(422);
      expect(((await res.json()) as Problem).fields?.map((field) => field.path)).toEqual(['nid']);
    });
  });
});
