import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type {
  CashierQueue,
  CashierSession,
  Invoice,
  InvoiceList,
  Payment,
  PermissionCode,
  ReceiptPrint,
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
  createOpdWorld,
  dataOf,
  staffClient,
  type StaffClient,
  type StaffSession,
} from '@hms/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from './http/configure-app.js';

// Payments and receipts over real HTTP against PostgreSQL (T-BIL-04; UC-BIL-01, UC-BIL-02;
// FR-BIL-002, FR-BIL-004, FR-BIL-011, FR-BIL-012, FR-BIL-019, FR-BIL-027, FR-BIL-034; C-038,
// C-039, C-040; AT-BIL-003, -004, -006, -008, -011..014, -016, -018). "Now" is 10:00 in Dhaka on
// 2026-11-12. The invoices are the doctor-fee invoices check-in issues. Names are synthetic.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const WEB = 'http://localhost:3100';
const PASSWORD = 'correct horse battery';
const TODAY = '2026-11-12';
const clock = fixedClock(new Date('2026-11-12T04:00:00Z'));
const CASHIER: PermissionCode[] = [
  'billing.payment.record',
  'billing.cashier_session.manage',
  'billing.invoice.issue',
];
const NOTHING = { CASH: '0.00', CARD: '0.00', MOBILE: '0.00', BANK_TRANSFER: '0.00' };

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
class PaymentTestModule {}

interface Problem {
  code: string;
  reason?: string;
  fields?: { path: string }[];
}

interface Allocation {
  lineId: string;
  amount: string;
}

describe('payments over HTTP', () => {
  let app: NestExpressApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let client: StaffClient;

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl);
    passwordHash = await hashPassword(PASSWORD);
    const moduleRef = await Test.createTestingModule({ imports: [PaymentTestModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, WEB);
    await app.listen(0, '127.0.0.1');
    client = staffClient(`${await app.getUrl()}/api/v1`, WEB, () => clock.now());
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const world = () =>
    createOpdWorld({ prisma, client, password: PASSWORD, passwordHash, today: TODAY });

  const post = (session: StaffSession, path: string, body: unknown, key = randomUUID()) =>
    client.call(session, 'POST', path, body, { 'Idempotency-Key': key });

  async function ok<T>(res: Response, status = 201): Promise<T> {
    expect(res.status).toBe(status);
    return (await dataOf(res)) as T;
  }

  async function refused(res: Response, status: number): Promise<Problem> {
    expect(res.status).toBe(status);
    return (await res.json()) as Problem;
  }

  const invoice = async (staff: StaffSession, invoiceId: string) =>
    ok<Invoice>(await client.call(staff, 'GET', `/billing/invoices/${invoiceId}`), 200);

  /** A cashier with an open session (float 1000.00). */
  async function openCashier(opd: Awaited<ReturnType<typeof world>>) {
    const cashier = await opd.staffOf(CASHIER);
    const session = await ok<CashierSession>(
      await post(cashier, '/billing/cashier-sessions', { openingFloat: '1000.00' }),
    );
    return { cashier, session };
  }

  const pay = (
    staff: StaffSession,
    patientId: string,
    amount: string,
    allocations: Allocation[],
    extra: Record<string, unknown> = {},
    key?: string,
  ) =>
    post(
      staff,
      '/billing/payments',
      { patientId, method: 'CASH', amount, allocations, ...extra },
      key,
    );

  /** One checked-in visit with its doctor-fee invoice (fee 500.00) and its single line. */
  async function oneVisit() {
    const opd = await world();
    const [doctor] = await opd.doctors(['500.00']);
    if (!doctor) throw new Error('No doctor');
    const visit = await opd.checkIn(doctor, await opd.patient());
    const { cashier, session } = await openCashier(opd);
    const line = (await invoice(cashier, visit.invoiceId)).lines[0];
    if (!line) throw new Error('No line');
    return { opd, visit, cashier, session, line };
  }

  it('AT-BIL-016: a payment needs an open cashier session', async () => {
    const opd = await world();
    const [doctor] = await opd.doctors(['500.00']);
    if (!doctor) throw new Error('No doctor');
    const visit = await opd.checkIn(doctor, await opd.patient());
    const cashier = await opd.staffOf(CASHIER);
    const line = (await invoice(cashier, visit.invoiceId)).lines[0];
    if (!line) throw new Error('No line');
    const problem = await refused(
      await pay(cashier, visit.patientId, '500.00', [{ lineId: line.lineId, amount: '500.00' }]),
      409,
    );
    expect(problem).toMatchObject({
      code: 'INVALID_TRANSITION',
      reason: 'CASHIER_SESSION_NOT_OPEN',
    });
  });

  it('UC-BIL-01: paying the doctor fee makes it PAID and the line ELIGIBLE, in one transaction', async () => {
    const { opd, visit, cashier, session, line } = await oneVisit();
    const payment = await ok<Payment>(
      await pay(cashier, visit.patientId, '500.00', [{ lineId: line.lineId, amount: '500.00' }]),
    );
    expect(payment).toMatchObject({
      receiptNumber: 'RCPT-000001',
      sessionId: session.sessionId,
      method: 'CASH',
      amount: '500.00',
      printCount: 0,
      invoices: [
        {
          invoiceId: visit.invoiceId,
          type: 'DOCTOR_FEE',
          paid: '500.00',
          balanceAfter: '0.00',
          lines: [{ lineId: line.lineId, itemCode: 'DOCTOR_FEE_NEW', amount: '500.00' }],
        },
      ],
    });
    expect(payment.patient.patientId).toBe(visit.patientId);
    const paid = await invoice(cashier, visit.invoiceId);
    expect(paid).toMatchObject({ status: 'PAID', paid: '500.00', balance: '0.00' });
    expect(paid.lines[0]).toMatchObject({
      allocatedAmount: '500.00',
      balance: '0.00',
      eligibility: 'ELIGIBLE',
    });

    const stored = await withTenant(prisma, { tenantId: opd.tenantId }, async (tx) => ({
      audit: await tx.auditEvent.count({ where: { action: 'billing.payment.recorded' } }),
      outbox: await tx.outboxEvent.count({ where: { eventType: 'PaymentRecorded' } }),
    }));
    expect(stored).toEqual({ audit: 1, outbox: 1 });

    // FR-BIL-026: the session now expects the float plus the cash taken.
    const closed = await ok<CashierSession>(
      await post(cashier, `/billing/cashier-sessions/${session.sessionId}/close`, {
        expectedVersion: session.version,
        counted: { ...NOTHING, CASH: '1500.00' },
      }),
      200,
    );
    expect(closed.totals[0]).toEqual({
      method: 'CASH',
      expected: '1500.00',
      counted: '1500.00',
      variance: '0.00',
    });
  });

  it('AT-BIL-011, AT-BIL-012: the same key returns the same receipt; other content is refused', async () => {
    const { visit, cashier, line } = await oneVisit();
    const key = randomUUID();
    const allocation = [{ lineId: line.lineId, amount: '500.00' }];
    const first = await ok<Payment>(
      await pay(cashier, visit.patientId, '500.00', allocation, {}, key),
    );
    const again = await ok<Payment>(
      await pay(cashier, visit.patientId, '500.00', allocation, {}, key),
    );
    expect(again.paymentId).toBe(first.paymentId);
    expect(again.receiptNumber).toBe(first.receiptNumber);
    const reused = await refused(
      await pay(
        cashier,
        visit.patientId,
        '400.00',
        [{ lineId: line.lineId, amount: '400.00' }],
        {},
        key,
      ),
      409,
    );
    expect(reused.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('AT-BIL-006, AT-BIL-014, AT-BIL-004: partial payments, no overpayment, sums must match', async () => {
    const { visit, cashier, line } = await oneVisit();
    await ok<Payment>(
      await pay(cashier, visit.patientId, '200.00', [{ lineId: line.lineId, amount: '200.00' }]),
    );
    const partly = await invoice(cashier, visit.invoiceId);
    expect(partly).toMatchObject({ status: 'PARTIALLY_PAID', balance: '300.00' });
    expect(partly.lines[0]).toMatchObject({ balance: '300.00', eligibility: 'NOT_ELIGIBLE' });

    const over = await refused(
      await pay(cashier, visit.patientId, '400.00', [{ lineId: line.lineId, amount: '400.00' }]),
      409,
    );
    expect(over.code).toBe('AMOUNT_EXCEEDS_BALANCE');
    const mismatch = await refused(
      await pay(cashier, visit.patientId, '100.00', [{ lineId: line.lineId, amount: '300.00' }]),
      422,
    );
    expect(mismatch).toMatchObject({ code: 'VALIDATION_FAILED', fields: [{ path: 'amount' }] });
  });

  it('C-039, AT-BIL-008: one MOBILE payment pays two invoices and is kept as MOBILE (bKash)', async () => {
    const opd = await world();
    const [first, second] = await opd.doctors(['500.00', '300.00']);
    if (!first || !second) throw new Error('No doctors');
    const patientId = await opd.patient();
    const morning = await opd.checkIn(first, patientId);
    const evening = await opd.checkIn(second, patientId);
    const { cashier, session } = await openCashier(opd);
    const open = await ok<InvoiceList>(
      await client.call(cashier, 'GET', `/billing/invoices?patientId=${patientId}&open=true`),
      200,
    );
    expect(open.invoices.map((row) => row.invoiceId).sort()).toEqual(
      [morning.invoiceId, evening.invoiceId].sort(),
    );
    const allocations = open.invoices.map((row) => ({
      lineId: row.lines[0]?.lineId ?? '',
      amount: row.balance,
    }));

    const payment = await ok<Payment>(
      await pay(cashier, patientId, '800.00', allocations, {
        method: 'MOBILE',
        providerLabel: 'bKash',
        externalReference: 'TX-9K2',
      }),
    );
    expect(payment).toMatchObject({
      amount: '800.00',
      method: 'MOBILE',
      providerLabel: 'bKash',
      externalReference: 'TX-9K2',
    });
    expect(payment.invoices).toHaveLength(2);
    expect(payment.invoices.every((row) => row.balanceAfter === '0.00')).toBe(true);
    const nothingOpen = await ok<InvoiceList>(
      await client.call(cashier, 'GET', `/billing/invoices?patientId=${patientId}&open=true`),
      200,
    );
    expect(nothingOpen.invoices).toEqual([]);
    const current = await ok<{ session: CashierSession }>(
      await client.call(cashier, 'GET', '/billing/cashier-sessions/current'),
      200,
    );
    expect(current.session.sessionId).toBe(session.sessionId);
    expect(current.session.totals.find((row) => row.method === 'MOBILE')?.expected).toBe('800.00');
  });

  it('C-039: a payment cannot mix patients', async () => {
    const opd = await world();
    const [doctor] = await opd.doctors(['500.00']);
    if (!doctor) throw new Error('No doctor');
    const salma = await opd.checkIn(doctor, await opd.patient());
    const rahima = await opd.checkIn(doctor, await opd.patient('Rahima Akter'));
    const { cashier } = await openCashier(opd);
    const lineOf = async (invoiceId: string) =>
      (await invoice(cashier, invoiceId)).lines[0]?.lineId ?? '';
    const problem = await refused(
      await pay(cashier, salma.patientId, '1000.00', [
        { lineId: await lineOf(salma.invoiceId), amount: '500.00' },
        { lineId: await lineOf(rahima.invoiceId), amount: '500.00' },
      ]),
      422,
    );
    expect(problem).toMatchObject({ code: 'VALIDATION_FAILED', fields: [{ path: 'allocations' }] });
  });

  it('AT-BIL-013: two cashiers paying the same line at once: one payment, one AMOUNT_EXCEEDS_BALANCE', async () => {
    const { opd, visit, cashier, line } = await oneVisit();
    const { cashier: colleague } = await openCashier(opd);
    const allocation = [{ lineId: line.lineId, amount: '500.00' }];
    const results = await Promise.all([
      pay(cashier, visit.patientId, '500.00', allocation),
      pay(colleague, visit.patientId, '500.00', allocation),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const loser = results.find((res) => res.status === 409);
    expect(((await loser?.json()) as Problem).code).toBe('AMOUNT_EXCEEDS_BALANCE');
    const stored = await withTenant(prisma, { tenantId: opd.tenantId }, (tx) =>
      tx.paymentAllocation.count({ where: { invoiceLineId: line.lineId } }),
    );
    expect(stored).toBe(1);
    expect((await invoice(cashier, visit.invoiceId)).paid).toBe('500.00');
  });

  it('AT-BIL-003: a doctor without billing.payment.record cannot record a payment', async () => {
    const { opd, visit, line } = await oneVisit();
    const doctor = await opd.staffOf(['clinical.consultation.record']);
    const problem = await refused(
      await pay(doctor, visit.patientId, '500.00', [{ lineId: line.lineId, amount: '500.00' }]),
      403,
    );
    expect(problem.code).toBe('PERMISSION_DENIED');
  });

  it('AT-BIL-018: a reprint is copy 2, audited, and creates no payment', async () => {
    const { opd, visit, cashier, line } = await oneVisit();
    const payment = await ok<Payment>(
      await pay(cashier, visit.patientId, '500.00', [{ lineId: line.lineId, amount: '500.00' }]),
    );
    const first = await ok<ReceiptPrint>(
      await post(cashier, `/billing/payments/${payment.paymentId}/prints`, { language: 'en' }),
    );
    expect(first.copyNo).toBe(1);
    expect(first.html).toContain(payment.receiptNumber);
    expect(first.html).toContain('Doctor fee: new patient (Doctor 1)');
    expect(first.html).not.toContain('Copy');
    const second = await ok<ReceiptPrint>(
      await post(cashier, `/billing/payments/${payment.paymentId}/prints`, { language: 'en' }),
    );
    expect(second.copyNo).toBe(2);
    expect(second.html).toContain('Copy 2');

    const stored = await withTenant(prisma, { tenantId: opd.tenantId }, async (tx) => ({
      payments: await tx.payment.count(),
      prints: await tx.auditEvent.count({ where: { action: 'billing.receipt.printed' } }),
    }));
    expect(stored).toEqual({ payments: 1, prints: 2 });
    const reread = await ok<Payment>(
      await client.call(cashier, 'GET', `/billing/payments/${payment.paymentId}`),
      200,
    );
    expect(reread.printCount).toBe(2);
  });

  it("SCR-06: today's queue lists patients who still owe, and a session lists its payments", async () => {
    const { visit, cashier, session, line } = await oneVisit();
    const before = await ok<CashierQueue>(
      await client.call(cashier, 'GET', '/billing/invoices/queue'),
      200,
    );
    expect(before.patients.map((row) => row.patient.patientId)).toEqual([visit.patientId]);
    expect(before.patients[0]?.invoices[0]).toMatchObject({
      type: 'DOCTOR_FEE',
      balance: '500.00',
    });

    const payment = await ok<Payment>(
      await pay(cashier, visit.patientId, '500.00', [{ lineId: line.lineId, amount: '500.00' }]),
    );
    const after = await ok<CashierQueue>(
      await client.call(cashier, 'GET', '/billing/invoices/queue'),
      200,
    );
    expect(after.patients).toEqual([]);
    const listed = await ok<{ payments: Payment[] }>(
      await client.call(cashier, 'GET', `/billing/payments?sessionId=${session.sessionId}`),
      200,
    );
    expect(listed.payments.map((row) => row.paymentId)).toEqual([payment.paymentId]);
  });
});
