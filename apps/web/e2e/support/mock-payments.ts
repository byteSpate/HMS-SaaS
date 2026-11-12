// In-memory stand-in for the cashier desk's invoice and payment endpoints (T-BIL-04) and the
// payment's outcome by key (T-BIL-05), answering with payloads that satisfy the shared contracts.
// A test can make the next payment's answer get lost, saved or not. Used by the cashier browser tests; the real
// behaviour (locks, races, audit, receipt pages) is covered by apps/api/src/payments.api.spec.ts.
// Names and amounts are synthetic.
import {
  invoiceSchema,
  paymentSchema,
  printReceiptRequestSchema,
  recordPaymentRequestSchema,
  type CashierSession,
  type Invoice,
  type InvoiceSummary,
  type PatientRef,
  type Payment,
} from '@hms/contracts';
import { amountOfCents, centsOf, type BillingAnswer } from './mock-billing';

const ID = (n: number): string => `0199e0e0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const CASHIER = { userId: ID(1), displayName: 'Nasima Khatun' };

const problem = (status: number, code: string) => ({
  status,
  body: { type: `urn:hms:error:${code}`, title: code, status, code },
});

export interface SeedLine {
  itemCode: string;
  itemNameEn?: string;
  amount: string;
}

const statusOf = (invoice: Invoice): Invoice['status'] => {
  if (centsOf(invoice.paid) === 0) return 'ISSUED';
  return centsOf(invoice.balance) === 0 ? 'PAID' : 'PARTIALLY_PAID';
};

export function createPaymentStore(openSession: () => CashierSession | undefined) {
  let next = 950;
  let receipts = 0;
  const invoices: Invoice[] = [];
  const patients = new Map<string, PatientRef>();
  const payments: Payment[] = [];
  const byKey = new Map<string, Payment>();
  /** T-BIL-05: the next payment's answer is lost (a 503 from a proxy), after or before saving. */
  let loseNext: 'saved' | 'notSaved' | null = null;
  function loseNextAnswer(mode: 'saved' | 'notSaved') {
    loseNext = mode;
  }

  /** An open invoice of a patient, as check-in or an order would have issued it. */
  function seedInvoice(patient: PatientRef, type: Invoice['type'], lines: SeedLine[]): Invoice {
    patients.set(patient.patientId, patient);
    const total = amountOfCents(lines.reduce((sum, line) => sum + centsOf(line.amount), 0));
    const invoice: Invoice = {
      invoiceId: ID(next++),
      number: `INV-${String(next).padStart(6, '0')}`,
      type,
      status: 'ISSUED',
      total,
      paid: '0.00',
      balance: total,
      patientId: patient.patientId,
      visitId: ID(next++),
      currency: 'BDT',
      subtotals: { medicine: '0.00', nonMedicine: total },
      issuedAt: new Date().toISOString(),
      version: 1,
      lines: lines.map((line, index) => ({
        lineId: ID(next++),
        lineNo: index + 1,
        itemCode: line.itemCode,
        itemNameEn: line.itemNameEn ?? null,
        itemNameBn: null,
        practitioner: null,
        quantity: 1,
        unitPrice: line.amount,
        amount: line.amount,
        category: 'NON_MEDICINE',
        status: 'ACTIVE',
        allocatedAmount: '0.00',
        balance: line.amount,
        eligibility: 'NOT_ELIGIBLE',
      })),
    };
    invoices.push(invoice);
    return invoice;
  }

  const open = (invoice: Invoice) =>
    invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID';
  const summaryOf = (invoice: Invoice): InvoiceSummary => ({
    invoiceId: invoice.invoiceId,
    number: invoice.number,
    type: invoice.type,
    status: invoice.status,
    total: invoice.total,
    paid: invoice.paid,
    balance: invoice.balance,
  });

  /** Pays one line: its amounts, its invoice's amounts and status, and the receipt's entry. */
  function applyAllocation(
    invoice: Invoice,
    line: Invoice['lines'][number],
    amount: string,
    paidInvoices: Map<string, Payment['invoices'][number]>,
  ) {
    const paid = centsOf(amount);
    line.allocatedAmount = amountOfCents(centsOf(line.allocatedAmount) + paid);
    line.balance = amountOfCents(centsOf(line.balance) - paid);
    line.eligibility = centsOf(line.balance) === 0 ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
    invoice.paid = amountOfCents(centsOf(invoice.paid) + paid);
    invoice.balance = amountOfCents(centsOf(invoice.balance) - paid);
    invoice.status = statusOf(invoice);
    invoice.version += 1;
    const entry = paidInvoices.get(invoice.invoiceId) ?? {
      invoiceId: invoice.invoiceId,
      number: invoice.number,
      type: invoice.type,
      paid: '0.00',
      balanceAfter: '0.00',
      lines: [],
    };
    entry.paid = amountOfCents(centsOf(entry.paid) + paid);
    entry.balanceAfter = invoice.balance;
    entry.lines.push({
      lineId: line.lineId,
      itemCode: line.itemCode,
      itemNameEn: line.itemNameEn,
      itemNameBn: line.itemNameBn,
      practitioner: null,
      amount,
    });
    paidInvoices.set(invoice.invoiceId, entry);
  }

  /** The request's problem before anything is written, or null. */
  function refusalOf(
    targets: {
      allocation: { amount: string };
      invoice?: Invoice;
      line?: Invoice['lines'][number];
    }[],
  ): BillingAnswer | null {
    for (const { allocation, line } of targets) {
      if (!line) return problem(404, 'NOT_FOUND');
      if (centsOf(allocation.amount) > centsOf(line.balance)) {
        return problem(409, 'AMOUNT_EXCEEDS_BALANCE');
      }
    }
    return null;
  }

  function record(body: unknown, key: string | null): BillingAnswer {
    const replay = key ? byKey.get(key) : undefined;
    if (replay) return { status: 201, body: replay };
    if (loseNext === 'notSaved') {
      loseNext = null;
      return problem(503, 'SERVICE_UNAVAILABLE');
    }
    const request = recordPaymentRequestSchema.safeParse(body);
    if (!request.success) return problem(422, 'VALIDATION_FAILED');
    const session = openSession();
    if (!session) return problem(409, 'INVALID_TRANSITION');
    const sum = request.data.allocations.reduce((total, row) => total + centsOf(row.amount), 0);
    if (sum !== centsOf(request.data.amount)) return problem(422, 'VALIDATION_FAILED');
    const targets = request.data.allocations.map((allocation) => {
      const invoice = invoices.find((row) =>
        row.lines.some((line) => line.lineId === allocation.lineId),
      );
      const line = invoice?.lines.find((row) => row.lineId === allocation.lineId);
      return { allocation, invoice, line };
    });
    const refusal = refusalOf(targets);
    if (refusal) return refusal;
    const patient = patients.get(request.data.patientId);
    if (!patient) return problem(404, 'NOT_FOUND');
    const paidInvoices = new Map<string, Payment['invoices'][number]>();
    for (const target of targets) {
      if (target.invoice && target.line) {
        applyAllocation(target.invoice, target.line, target.allocation.amount, paidInvoices);
      }
    }
    const expected = session.totals.find((row) => row.method === request.data.method);
    if (expected) expected.expected = amountOfCents(centsOf(expected.expected) + sum);
    receipts += 1;
    const payment = paymentSchema.parse({
      paymentId: ID(next++),
      receiptNumber: `RCPT-${String(receipts).padStart(6, '0')}`,
      patient,
      sessionId: session.sessionId,
      method: request.data.method,
      providerLabel: request.data.providerLabel ?? null,
      externalReference: request.data.externalReference ?? null,
      amount: request.data.amount,
      receivedAt: new Date().toISOString(),
      cashier: CASHIER,
      invoices: [...paidInvoices.values()],
      printCount: 0,
    });
    payments.unshift(payment);
    if (key) byKey.set(key, payment);
    if (loseNext === 'saved') {
      loseNext = null;
      return problem(503, 'SERVICE_UNAVAILABLE');
    }
    return { status: 201, body: payment };
  }

  function print(paymentId: string, body: unknown): BillingAnswer {
    const payment = payments.find((row) => row.paymentId === paymentId);
    if (!payment) return problem(404, 'NOT_FOUND');
    if (!printReceiptRequestSchema.safeParse(body).success) {
      return problem(422, 'VALIDATION_FAILED');
    }
    payment.printCount += 1;
    const copy = payment.printCount > 1 ? ` Copy ${payment.printCount}` : '';
    const html = `<!doctype html><html><head><title>${payment.receiptNumber}</title></head><body><h1>${payment.receiptNumber}${copy}</h1></body></html>`;
    return { status: 201, body: { copyNo: payment.printCount, html } };
  }

  /** T-BIL-05: what happened to the payment sent with this key. */
  function outcomeOf(key: string): BillingAnswer {
    const payment = byKey.get(key);
    if (!payment) return problem(404, 'NOT_FOUND');
    return {
      status: 200,
      body: {
        idempotencyKey: key,
        operation: 'billing.payment.record',
        status: 'COMPLETED',
        result: payment,
      },
    };
  }

  function queue(): BillingAnswer {
    const byPatient = new Map<string, InvoiceSummary[]>();
    for (const invoice of invoices.filter(open)) {
      byPatient.set(invoice.patientId, [
        ...(byPatient.get(invoice.patientId) ?? []),
        summaryOf(invoice),
      ]);
    }
    return {
      status: 200,
      body: {
        patients: [...byPatient].map(([patientId, rows]) => ({
          patient: patients.get(patientId),
          invoices: rows,
        })),
      },
    };
  }

  function answer(
    method: string,
    path: string,
    body: unknown,
    query: URLSearchParams,
    key: string | null,
  ): BillingAnswer | undefined {
    const operation = /^\/operations\/([^/]+)$/.exec(path);
    if (operation?.[1] && method === 'GET') return outcomeOf(operation[1]);
    if (method === 'GET' && path === '/billing/invoices/queue') return queue();
    if (method === 'GET' && path === '/billing/invoices') {
      const patientId = query.get('patientId');
      const rows = invoices
        .filter((invoice) => invoice.patientId === patientId)
        .filter((invoice) => query.get('open') !== 'true' || open(invoice));
      return { status: 200, body: { invoices: rows.map((row) => invoiceSchema.parse(row)) } };
    }
    if (path === '/billing/payments') {
      if (method === 'POST') return record(body, key);
      if (method === 'GET') {
        const sessionId = query.get('sessionId');
        return {
          status: 200,
          body: { payments: payments.filter((row) => row.sessionId === sessionId) },
        };
      }
    }
    const printPath = /^\/billing\/payments\/([^/]+)\/prints$/.exec(path);
    if (printPath?.[1] && method === 'POST') return print(printPath[1], body);
    return undefined;
  }

  return { invoices, payments, seedInvoice, loseNextAnswer, answer };
}
