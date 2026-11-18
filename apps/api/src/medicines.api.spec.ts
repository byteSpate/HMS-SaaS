import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  MedicineChoiceList,
  MedicineRecord,
  PrescribingTermChoices,
  PrescribingTermRecord,
} from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { fixedClock } from '@hms/domain-kernel';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
} from '@hms/mod-identity-access';
import { PharmacyModule } from '@hms/mod-pharmacy';
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

// Medicine catalogue and prescribing lists over real HTTP against PostgreSQL (T-CLI-03;
// FR-CLI-004, FR-PHA-011 subset; Q-067 interim; FR-I18N-006; SP-03; FR-AUD-001; ADR-003).
// Medicine names are synthetic examples (AS-009).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const clock = fixedClock(new Date('2026-11-18T06:00:00Z'));
// "Orally" in Bangla, written as escapes (code stays ASCII).
const ORAL_BN = '\u09AE\u09C1\u0996\u09C7';

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'm'.repeat(32),
        lockout: { maxFailedAttempts: 5, lockMinutes: 15 },
        loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
        mfa: { encryptionKey: Buffer.alloc(32, 7), issuer: 'HMS test' },
      },
      clock,
      { allowedOrigins: [WEB] },
    ),
    PharmacyModule.forRoot({ clock }),
  ],
})
class MedicinesTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

function formOf(medicine: MedicineRecord) {
  return {
    brandName: medicine.brandName,
    genericName: medicine.genericName,
    strength: medicine.strength,
    form: medicine.form,
    nameBn: medicine.nameBn,
    manufacturer: medicine.manufacturer,
    active: medicine.active,
  };
}

const napa = () => ({
  brandName: 'Napa',
  genericName: 'Paracetamol',
  strength: '500 mg',
  form: 'Tablet',
  manufacturer: 'Example Pharma',
});

describe('medicine catalogue and prescribing lists over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({
      imports: [MedicinesTestModule],
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

  /** A hospital with the clinical module, its administrator and a doctor. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['clinical']);
    const admin = await staffOf(tenantId, ['admin.config.publish']);
    const doctor = await staffOf(tenantId, ['clinical.prescription.create']);
    return { tenantId, admin, doctor };
  }

  async function createdMedicine(session: StaffSession, body: unknown = napa()) {
    const res = await client.call(session, 'POST', '/admin/medicines', body);
    expect(res.status).toBe(201);
    return (await dataOf(res)) as MedicineRecord;
  }

  async function createdTerm(session: StaffSession, body: unknown) {
    const res = await client.call(session, 'POST', '/admin/prescribing-terms', body);
    expect(res.status).toBe(201);
    return (await dataOf(res)) as PrescribingTermRecord;
  }

  async function search(session: StaffSession, text: string) {
    const res = await client.call(
      session,
      'GET',
      `/prescribing/medicines?q=${encodeURIComponent(text)}`,
    );
    expect(res.status).toBe(200);
    return ((await dataOf(res)) as MedicineChoiceList).medicines;
  }

  it('adds a medicine with an audit event and an outbox event', async () => {
    const { tenantId, admin } = await hospital();
    const medicine = await createdMedicine(admin, { ...napa(), brandName: '  Napa  ' });
    expect(medicine).toMatchObject({ ...napa(), nameBn: null, active: true, version: 1 });

    const [audits, events] = await withTenant(prisma, { tenantId }, (tx) =>
      Promise.all([
        tx.auditEvent.findMany({
          where: { action: 'pharmacy.medicine.created', targetId: medicine.medicineId },
        }),
        tx.outboxEvent.findMany({
          where: { eventType: 'MedicineChanged', aggregateId: medicine.medicineId },
        }),
      ]),
    );
    expect(audits).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it('refuses the same brand, strength and form twice in any letter case', async () => {
    const { admin } = await hospital();
    await createdMedicine(admin);
    const again = await client.call(admin, 'POST', '/admin/medicines', {
      ...napa(),
      brandName: 'NAPA',
      strength: '500 MG',
      form: 'tablet',
    });
    expect(again.status).toBe(422);
    expect(((await again.json()) as Problem).fields?.map((field) => field.path)).toEqual([
      'brandName',
    ]);
    // Another strength is another medicine.
    await createdMedicine(admin, { ...napa(), strength: '665 mg' });
  });

  it('edits at the version the screen showed and refuses a stale edit', async () => {
    const { admin } = await hospital();
    const medicine = await createdMedicine(admin);
    const path = `/admin/medicines/${medicine.medicineId}`;
    const saved = await client.call(admin, 'PUT', path, {
      ...formOf(medicine),
      nameBn: '\u09A8\u09BE\u09AA\u09BE',
      expectedVersion: 1,
    });
    expect(saved.status).toBe(200);
    expect(await dataOf(saved)).toMatchObject({ version: 2, nameBn: '\u09A8\u09BE\u09AA\u09BE' });

    const stale = await client.call(admin, 'PUT', path, {
      ...formOf(medicine),
      expectedVersion: 1,
    });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Problem).code).toBe('STALE_RECORD');

    const unchanged = await client.call(admin, 'PUT', path, {
      ...formOf(medicine),
      nameBn: '\u09A8\u09BE\u09AA\u09BE',
      expectedVersion: 2,
    });
    expect(unchanged.status).toBe(422);
  });

  it('the doctor finds active medicines by brand or generic name; a deactivated one is gone', async () => {
    const { admin, doctor } = await hospital();
    const medicine = await createdMedicine(admin);
    await createdMedicine(admin, {
      brandName: 'Amoxil',
      genericName: 'Amoxicillin',
      strength: '500 mg',
      form: 'Capsule',
    });

    expect((await search(doctor, 'para')).map((row) => row.brandName)).toEqual(['Napa']);
    expect((await search(doctor, 'AMOX')).map((row) => row.genericName)).toEqual(['Amoxicillin']);

    await client.call(admin, 'PUT', `/admin/medicines/${medicine.medicineId}`, {
      ...formOf(medicine),
      active: false,
      expectedVersion: 1,
    });
    expect(await search(doctor, 'napa')).toEqual([]);
  });

  it('keeps each hospital to its own catalogue (RLS)', async () => {
    const first = await hospital();
    const second = await hospital();
    await createdMedicine(first.admin);
    expect(await search(second.doctor, 'napa')).toEqual([]);
  });

  it('needs admin.config.publish to manage and clinical.prescription.create to search', async () => {
    const { admin, doctor } = await hospital();
    expect((await client.call(doctor, 'POST', '/admin/medicines', napa())).status).toBe(403);
    expect((await client.call(doctor, 'GET', '/admin/medicines')).status).toBe(403);
    expect((await client.call(admin, 'GET', '/prescribing/medicines?q=napa')).status).toBe(403);
    expect((await client.call(doctor, 'GET', '/prescribing/medicines')).status).toBe(422);
  });

  it('keeps bilingual terms by kind and gives the doctor the active ones in order', async () => {
    const { admin, doctor } = await hospital();
    const oral = await createdTerm(admin, { kind: 'ROUTE', labelEn: 'Oral', labelBn: ORAL_BN });
    await createdTerm(admin, { kind: 'FREQUENCY', labelEn: 'Twice daily', sortOrder: 2 });
    await createdTerm(admin, { kind: 'FREQUENCY', labelEn: 'Once daily', sortOrder: 1 });
    const week = await createdTerm(admin, { kind: 'DURATION', labelEn: '7 days' });

    const labelless = await client.call(admin, 'POST', '/admin/prescribing-terms', {
      kind: 'ROUTE',
    });
    expect(labelless.status).toBe(422);

    // The kind never changes: it is not part of an edit.
    const kindChange = await client.call(admin, 'PUT', `/admin/prescribing-terms/${oral.termId}`, {
      kind: 'FREQUENCY',
      labelEn: 'Oral',
      labelBn: ORAL_BN,
      sortOrder: 0,
      active: true,
      expectedVersion: 1,
    });
    expect(kindChange.status).toBe(422);

    const off = await client.call(admin, 'PUT', `/admin/prescribing-terms/${week.termId}`, {
      labelEn: '7 days',
      sortOrder: 0,
      active: false,
      expectedVersion: 1,
    });
    expect(off.status).toBe(200);

    const res = await client.call(doctor, 'GET', '/prescribing/terms');
    const choices = (await dataOf(res)) as PrescribingTermChoices;
    expect(choices.routes).toEqual([{ termId: oral.termId, labelBn: ORAL_BN, labelEn: 'Oral' }]);
    expect(choices.frequencies.map((term) => term.labelEn)).toEqual(['Once daily', 'Twice daily']);
    expect(choices.durations).toEqual([]);
  });

  it('never deletes a catalogue row or changes who created it', async () => {
    const { tenantId, admin } = await hospital();
    const medicine = await createdMedicine(admin);
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.medicine.delete({ where: { id: medicine.medicineId } }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(prisma, { tenantId }, (tx) =>
        tx.medicine.update({
          where: { id: medicine.medicineId },
          data: { createdBy: medicine.medicineId },
        }),
      ),
    ).rejects.toThrow();
  });
});
