import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Invoice, InvoiceList, Practitioner, PriceList } from '@hms/contracts';
import { createPrismaClient, withTenant, type PrismaClient } from '@hms/database';
import { DomainError, fixedClock } from '@hms/domain-kernel';
import { BillingModule, postCharge, type PostChargeRequest } from '@hms/mod-billing';
import {
  DEFAULT_LOGIN_RATE_LIMITS,
  hashPassword,
  IdentityAccessModule,
} from '@hms/mod-identity-access';
import { PatientsModule } from '@hms/mod-patients';
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

// The charge interface and invoices against PostgreSQL (T-BIL-02; FR-BIL-001, FR-BIL-006,
// FR-BIL-007, FR-BIL-008, FR-BIL-030, FR-BIL-031, FR-BIL-033; C-008; AT-BIL-002, -009, -010,
// -021, -022; AT-CFG-002). postCharge is called in a tenant transaction as another module would;
// the invoices are read over HTTP. "Now" is 10:00 in Dhaka on 2026-11-12. Names are synthetic.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
// Less than the 60-minute idle timeout, so the sessions stay signed in.
const HALF_HOUR = 1_800_000;
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
    BillingModule.forRoot({ clock }),
  ],
})
class ChargesTestModule {}

describe('charges and invoices', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;
  let phone = 0;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [ChargesTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    client = staffClient(`${await app.getUrl()}/api/v1`, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const idem = () => ({ 'Idempotency-Key': randomUUID() });

  async function staffOf(
    tenantId: string,
    permissions: Parameters<typeof grantPermissions>[3],
  ): Promise<{ session: StaffSession; userId: string }> {
    const user = await seedUser(prisma, { passwordHash });
    const membership = await seedMembership(prisma, tenantId, user.id);
    if (permissions.length > 0) await grantPermissions(prisma, tenantId, membership, permissions);
    return { session: await client.sessionOf(user.username, PASSWORD), userId: user.id };
  }

  async function call(session: StaffSession, method: string, path: string, body?: object) {
    const res = await client.call(session, method, path, body, method === 'GET' ? {} : idem());
    expect(res.status, path).toBeLessThan(300);
    return dataOf(res);
  }

  /** Publishes a price list where the given doctors have these new-patient fees. */
  async function publishFees(admin: StaffSession, fees: Array<[string, string]>) {
    let list = (await call(admin, 'POST', '/billing/price-lists', {})) as PriceList;
    for (const [practitionerId, newPatientFee] of fees) {
      list = (await call(
        admin,
        'PUT',
        `/billing/price-lists/${list.priceListId}/doctor-fees/${practitionerId}`,
        { newPatientFee, followUpFee: '300.00', followUpDays: 14, expectedVersion: list.version },
      )) as PriceList;
    }
    await call(admin, 'POST', `/billing/price-lists/${list.priceListId}/publish`, {
      expectedVersion: list.version,
    });
  }

  /** A hospital with a doctor whose fee is published, a patient, and a cashier. */
  async function hospital() {
    const tenantId = await seedTenant(prisma);
    await seedEntitlements(prisma, tenantId, ['patients', 'billing']);
    const admin = await staffOf(tenantId, [
      'practitioner.manage',
      'admin.price.publish',
      'patient.record.register',
    ]);
    const cashier = await staffOf(tenantId, ['billing.invoice.issue']);
    const doctor = (await call(admin.session, 'POST', '/practitioners', {
      nameEn: 'Karim Uddin',
    })) as Practitioner;
    const unpriced = (await call(admin.session, 'POST', '/practitioners', {
      nameEn: 'Rahima Akter',
    })) as Practitioner;
    await publishFees(admin.session, [[doctor.practitionerId, '500.00']]);
    const patient = (await call(admin.session, 'POST', '/patients', {
      nameEn: 'Salma Begum',
      sex: 'FEMALE',
      birthDate: '1990-05-14',
      phone: `0171200${String(phone++).padStart(4, '0')}`,
      confirmNewDespiteCandidates: true,
      shownCandidateIds: [],
    })) as { patientId: string };
    const scope = { tenantId, userId: admin.userId, correlationId: randomUUID() };

    const feeFor = (practitionerId: string, visitId = randomUUID()): PostChargeRequest => ({
      source: { module: 'clinical', type: 'visit', id: visitId, event: 'CHECKED_IN' },
      patientId: patient.patientId,
      visitId,
      serviceItemCode: 'DOCTOR_FEE_NEW',
      practitionerId,
      quantity: 1,
      serviceTime: clock.now(),
    });
    const post = (request: PostChargeRequest) =>
      withTenant(prisma, { tenantId }, (tx) => postCharge(tx, scope, request, clock.now()));
    return { tenantId, admin, cashier, doctor, unpriced, feeFor, post };
  }

  const codeOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return 'NONE';
    } catch (error) {
      return error instanceof DomainError ? error.code : String(error);
    }
  };

  it('C-008, FR-BIL-007: issues the doctor fee on its own invoice at the published price', async () => {
    const { cashier, doctor, feeFor, post } = await hospital();
    const request = feeFor(doctor.practitionerId);
    const posted = await post(request);
    expect(posted.replayed).toBe(false);

    const res = await client.call(
      cashier.session,
      'GET',
      `/billing/invoices?visitId=${request.visitId}`,
    );
    const { invoices } = (await dataOf(res)) as InvoiceList;
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      invoiceId: posted.invoiceId,
      number: 'INV-000001',
      type: 'DOCTOR_FEE',
      status: 'ISSUED',
      total: '500.00',
      paid: '0.00',
      balance: '500.00',
      subtotals: { medicine: '0.00', nonMedicine: '500.00' },
      lines: [
        {
          lineNo: 1,
          itemCode: 'DOCTOR_FEE_NEW',
          practitioner: expect.objectContaining({ nameEn: 'Karim Uddin' }),
          quantity: 1,
          unitPrice: '500.00',
          amount: '500.00',
          category: 'NON_MEDICINE',
        },
      ],
    });
  });

  it('AT-BIL-009, AT-BIL-010: a repeated source returns the first charge; other content is refused', async () => {
    const { tenantId, doctor, feeFor, post } = await hospital();
    const request = feeFor(doctor.practitionerId);
    const first = await post(request);
    const again = await post(request);
    expect(again).toEqual({ ...first, replayed: true });
    expect(await codeOf(post({ ...request, quantity: 2 }))).toBe('IDEMPOTENCY_KEY_REUSED');

    const charges = await withTenant(prisma, { tenantId }, (tx) =>
      tx.charge.count({ where: { sourceId: request.source.id } }),
    );
    expect(charges).toBe(1);
  });

  it('FR-BIL-010 A1: an item without a price in force is POLICY_NOT_CONFIGURED, no invoice', async () => {
    const { tenantId, unpriced, feeFor, post } = await hospital();
    const request = feeFor(unpriced.practitionerId);
    expect(await codeOf(post(request))).toBe('POLICY_NOT_CONFIGURED');
    const invoices = await withTenant(prisma, { tenantId }, (tx) =>
      tx.invoice.count({ where: { visitId: request.visitId } }),
    );
    expect(invoices).toBe(0);
  });

  it('AT-CFG-002: a charge keeps its price after a new version is published', async () => {
    const { cashier, admin, doctor, feeFor, post } = await hospital();
    const before = feeFor(doctor.practitionerId);
    await post(before);
    clock.advanceBy(HALF_HOUR);
    try {
      await publishFees(admin.session, [[doctor.practitionerId, '650.00']]);
      const after = feeFor(doctor.practitionerId);
      const posted = await post(after);
      const read = async (invoiceId: string) =>
        (await dataOf(
          await client.call(cashier.session, 'GET', `/billing/invoices/${invoiceId}`),
        )) as Invoice;
      expect((await read(posted.invoiceId)).total).toBe('650.00');
      const old = (await dataOf(
        await client.call(cashier.session, 'GET', `/billing/invoices?visitId=${before.visitId}`),
      )) as InvoiceList;
      expect(old.invoices[0]?.total).toBe('500.00');
    } finally {
      clock.advanceBy(-HALF_HOUR);
    }
  });

  it('FR-BIL-031, AT-BIL-022: concurrent postings to one invoice keep the total equal to the lines', async () => {
    const { tenantId, doctor, feeFor, post } = await hospital();
    const visitId = randomUUID();
    const requests = Array.from({ length: 6 }, (_, index) => ({
      ...feeFor(doctor.practitionerId, visitId),
      source: { module: 'test', type: 'posting', id: `${visitId}:${index}`, event: 'POSTED' },
    }));
    const posted = await Promise.all(requests.map(post));
    expect(new Set(posted.map((charge) => charge.invoiceId)).size).toBe(1);

    // The reconciliation query: no invoice of the hospital whose total differs from its lines.
    const mismatched = await withTenant(
      prisma,
      { tenantId },
      (tx) =>
        tx.$queryRaw<{ id: string }[]>`
        SELECT i.id FROM hms.invoice i
        LEFT JOIN hms.invoice_line l ON l.invoice_id = i.id AND l.status = 'ACTIVE'
        GROUP BY i.id, i.total
        HAVING i.total <> COALESCE(SUM(l.net_amount), 0)`,
    );
    expect(mismatched).toEqual([]);
    const lines = await withTenant(prisma, { tenantId }, (tx) =>
      tx.invoiceLine.findMany({
        where: { invoiceId: posted[0]?.invoiceId },
        select: { lineNo: true },
      }),
    );
    expect(lines.map((line) => line.lineNo).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("needs billing.invoice.issue and hides another hospital's invoices", async () => {
    const { tenantId, doctor, feeFor, post } = await hospital();
    const posted = await post(feeFor(doctor.practitionerId));
    const reception = await staffOf(tenantId, ['patient.record.search']);
    const denied = await client.call(
      reception.session,
      'GET',
      `/billing/invoices/${posted.invoiceId}`,
    );
    expect(denied.status).toBe(403);

    const other = await hospital();
    const hidden = await client.call(
      other.cashier.session,
      'GET',
      `/billing/invoices/${posted.invoiceId}`,
    );
    expect(hidden.status).toBe(404);
  });
});
