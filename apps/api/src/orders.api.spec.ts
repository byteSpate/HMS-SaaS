import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  Invoice,
  OrderableServiceList,
  PriceList,
  ServiceOrderList,
  ServiceRecord,
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

// Service orders over real HTTP against PostgreSQL (T-ORD-01; FR-ORD-001..005, FR-ORD-007;
// UC-CLI-01 step 3; C-008, C-011; FPR-09). "Now" is 10:00 in Dhaka on 2026-11-19. Synthetic data.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const TODAY = '2026-11-19';
const clock = fixedClock(new Date('2026-11-19T04:00:00Z'));

@Module({
  imports: [
    RequestPipelineModule.forRoot({ level: 'silent' }),
    DatabaseModule.forRoot(databaseUrl),
    IdentityAccessModule.forRoot(
      {
        timeouts: { idleMinutes: 60, absoluteHours: 12 },
        csrfSecret: 'o'.repeat(32),
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
class OrdersTestModule {}

interface Problem {
  code: string;
  fields?: { path: string }[];
}

const DOCTOR = [
  'clinical.consultation.record',
  'clinical.document.sign',
  'order.service.create',
  'order.service.cancel',
] as const;

describe('service orders over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [OrdersTestModule] }).compile();
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
    if (res.status !== status) {
      throw new Error(`Expected ${status}, got ${res.status}: ${await res.text()}`);
    }
    return (await dataOf(res)) as T;
  }

  const post = (session: StaffSession, path: string, body: unknown, key = randomUUID()) =>
    client.call(session, 'POST', path, body, { 'Idempotency-Key': key });

  /**
   * A hospital with CBC (directly orderable, 450.00) and a chest X-ray (doctor only, 800.00) in
   * the price list in force, and a doctor in consultation with a patient whose fee is paid.
   */
  async function consulting() {
    const world = await createOpdWorld({
      prisma,
      client,
      password: PASSWORD,
      passwordHash,
      today: TODAY,
    });
    const [doctor, otherDoctor] = await world.signedInDoctors([DOCTOR, DOCTOR]);
    if (!doctor || !otherDoctor) throw new Error('No doctors');
    const admin = await world.staffOf(['admin.price.publish']);
    const service = async (body: object) =>
      ok<ServiceRecord>(await client.call(admin, 'POST', '/billing/services', body), 201);
    const cbc = await service({
      code: 'CBC',
      category: 'LAB',
      nameEn: 'Complete blood count',
      directlyOrderable: true,
      reportHours: 6,
    });
    const xray = await service({
      code: 'XRAY-CHEST',
      category: 'IMAGING',
      nameEn: 'Chest X-ray',
      directlyOrderable: false,
      reportHours: 24,
    });
    const unpriced = await service({
      code: 'ECG',
      category: 'PROCEDURE',
      nameEn: 'ECG',
      directlyOrderable: true,
      reportHours: null,
    });
    let draft = await ok<PriceList>(await post(admin, '/billing/price-lists', {}), 201);
    for (const [item, price] of [
      [cbc, '450.00'],
      [xray, '800.00'],
    ] as const) {
      draft = await ok<PriceList>(
        await client.call(
          admin,
          'PUT',
          `/billing/price-lists/${draft.priceListId}/service-prices/${item.serviceItemId}`,
          { unitPrice: price, expectedVersion: draft.version },
          { 'Idempotency-Key': randomUUID() },
        ),
      );
    }
    // Each version takes effect at its own instant; the doctors' fees were published at "now".
    clock.advanceBy(1000);
    await ok(
      await post(admin, `/billing/price-lists/${draft.priceListId}/publish`, {
        expectedVersion: draft.version,
      }),
    );
    const patientId = await world.patient('Salma Begum');
    const { consultationId, visit } = await world.consultation(doctor, patientId);
    return { ...world, doctor, otherDoctor, consultationId, visit, cbc, xray, unpriced };
  }

  const orders = (consultationId: string) => `/consultations/${consultationId}/orders`;
  const item = (serviceItemId: string, priority = 'ROUTINE') => ({
    serviceItemId,
    priority,
    clinicalNote: null,
  });

  it('UC-CLI-01 step 3: orders become lines on the service invoice, unpaid (FR-ORD-003, -005)', async () => {
    const opd = await consulting();
    const placed = await ok<ServiceOrderList>(
      await post(opd.doctor.session, orders(opd.consultationId), {
        items: [
          item(opd.cbc.serviceItemId, 'URGENT'),
          { ...item(opd.xray.serviceItemId), clinicalNote: 'Cough for two weeks' },
        ],
      }),
      201,
    );
    expect(
      placed.orders.map((order) => [
        order.service.code,
        order.priority,
        order.status,
        order.reportHours,
      ]),
    ).toEqual([
      ['CBC', 'URGENT', 'REQUESTED', 6],
      ['XRAY-CHEST', 'ROUTINE', 'REQUESTED', 24],
    ]);
    // FR-ORD-005: the paid doctor fee does not make the orders eligible.
    expect(placed.orders.map((order) => order.payment)).toEqual([
      { amount: '450.00', paid: '0.00', eligibility: 'NOT_ELIGIBLE', lineStatus: 'ACTIVE' },
      { amount: '800.00', paid: '0.00', eligibility: 'NOT_ELIGIBLE', lineStatus: 'ACTIVE' },
    ]);
    expect(placed.orders[1]).toMatchObject({
      source: 'CONSULTATION',
      clinicalNote: 'Cough for two weeks',
    });

    const [invoices, events] = await withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
      Promise.all([
        tx.invoice.findMany({
          where: { visitId: opd.visit.visitId },
          select: { type: true, total: true },
        }),
        tx.outboxEvent.count({ where: { eventType: 'ServiceOrdered' } }),
      ]),
    );
    expect(invoices.map((row) => [row.type, row.total.toFixed(2)]).sort()).toEqual([
      ['DOCTOR_FEE', '500.00'],
      ['SERVICE', '1250.00'],
    ]);
    expect(events).toBe(2);
  });

  it('paying a line makes its order eligible, and only that one', async () => {
    const opd = await consulting();
    const placed = await ok<ServiceOrderList>(
      await post(opd.doctor.session, orders(opd.consultationId), {
        items: [item(opd.cbc.serviceItemId), item(opd.xray.serviceItemId)],
      }),
      201,
    );
    const cashier = await opd.staffOf([
      'billing.cashier_session.manage',
      'billing.payment.record',
      'billing.invoice.issue',
    ]);
    await ok(await post(cashier, '/billing/cashier-sessions', { openingFloat: '0.00' }), 201);
    const list = await ok<{ invoices: Invoice[] }>(
      await client.call(cashier, 'GET', `/billing/invoices?patientId=${opd.visit.patientId}`),
    );
    const service = list.invoices.find((invoice) => invoice.type === 'SERVICE');
    const cbcLine = service?.lines.find((line) => line.amount === '450.00');
    if (!service || !cbcLine) throw new Error('No service invoice');
    await ok(
      await post(cashier, '/billing/payments', {
        patientId: opd.visit.patientId,
        method: 'CASH',
        amount: '450.00',
        allocations: [{ lineId: cbcLine.lineId, amount: '450.00' }],
      }),
      201,
    );
    const after = await ok<ServiceOrderList>(
      await client.call(opd.doctor.session, 'GET', orders(opd.consultationId)),
    );
    expect(after.orders.map((order) => [order.service.code, order.payment.eligibility])).toEqual([
      ['CBC', 'ELIGIBLE'],
      ['XRAY-CHEST', 'NOT_ELIGIBLE'],
    ]);
    expect(placed.orders).toHaveLength(2);
  });

  it('refuses a service without a price in force, naming the item', async () => {
    const opd = await consulting();
    const res = await post(opd.doctor.session, orders(opd.consultationId), {
      items: [item(opd.cbc.serviceItemId), item(opd.unpriced.serviceItemId)],
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Problem).fields?.map((field) => field.path)).toEqual([
      'items.1.serviceItemId',
    ]);
    // Nothing of the request was kept.
    const list = await ok<ServiceOrderList>(
      await client.call(opd.doctor.session, 'GET', orders(opd.consultationId)),
    );
    expect(list.orders).toEqual([]);
  });

  it("the doctor's picker offers every priced service; reception's only the direct ones", async () => {
    const opd = await consulting();
    const doctorPick = await ok<OrderableServiceList>(
      await client.call(opd.doctor.session, 'GET', '/orders/services?q=c'),
    );
    // By category, then code: imaging before laboratory.
    expect(doctorPick.services.map((row) => [row.code, row.unitPrice])).toEqual([
      ['XRAY-CHEST', '800.00'],
      ['CBC', '450.00'],
    ]);
    const reception = await opd.staffOf(['order.direct_diagnostic.create']);
    const direct = await ok<OrderableServiceList>(
      await client.call(reception, 'GET', '/orders/direct-services?q=c'),
    );
    expect(direct.services.map((row) => row.code)).toEqual(['CBC']);
    expect((await client.call(reception, 'GET', '/orders/services?q=c')).status).toBe(403);
  });

  it("another doctor's consultation is not found, and a retry places the orders once", async () => {
    const opd = await consulting();
    expect(
      (await client.call(opd.otherDoctor.session, 'GET', orders(opd.consultationId))).status,
    ).toBe(404);
    const key = randomUUID();
    const body = { items: [item(opd.cbc.serviceItemId)] };
    const first = await post(opd.doctor.session, orders(opd.consultationId), body, key);
    const again = await post(opd.doctor.session, orders(opd.consultationId), body, key);
    expect(again.status).toBe(201);
    expect(again.headers.get('Idempotent-Replay')).toBe('true');
    expect(await dataOf(again)).toEqual(await dataOf(first));
    const count = await withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
      tx.serviceOrder.count({ where: { visitId: opd.visit.visitId } }),
    );
    expect(count).toBe(1);
  });
});
