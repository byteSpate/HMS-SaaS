// Payment, allocation and receipt print rows in PostgreSQL (T-BIL-04; FR-BIL-011, FR-BIL-027,
// FR-BIL-034; E section 9.1). Every function runs in the caller's withTenant() transaction, so RLS
// limits it to one hospital (ADR-003). Amounts cross the boundary here only (ADR-007).
import type { TenantTx } from '@hms/database';
import { Money } from '@hms/domain-kernel';
import { SESSION_METHODS, zeroAmounts, type MethodAmounts } from '../domain/cashier-session.js';
import type { InvoiceType } from '../domain/invoice.js';
import type { InvoiceState, LineState, PaymentPlan } from '../domain/payment.js';

const moneyOf = (value: { toFixed(digits: number): string }) => Money.parse(value.toFixed(2));

/**
 * The cashier's open session at the facility, share-locked until the transaction ends. Closing
 * the session takes the row lock (T-BIL-03), so it waits for this payment; and a payment that
 * comes after the close sees no open session.
 */
export async function lockOpenSession(
  tx: TenantTx,
  facilityId: string,
  cashierId: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM hms.cashier_session
    WHERE facility_id = ${facilityId}::uuid AND cashier_id = ${cashierId}::uuid AND status = 'OPEN'
    FOR SHARE`;
  return rows[0]?.id ?? null;
}

/** The invoices the lines belong to, before anything is locked. */
export async function invoiceIdsOfLines(
  tx: TenantTx,
  lineIds: readonly string[],
): Promise<string[]> {
  const rows = await tx.invoiceLine.findMany({
    where: { id: { in: [...lineIds] } },
    select: { invoiceId: true },
  });
  return [...new Set(rows.map((row) => row.invoiceId))];
}

/**
 * Locks the invoices for the payment (E section 9.1 step 1). In ID order, so two payments that
 * touch the same invoices queue instead of deadlocking (FR-BIL-034).
 */
export async function lockInvoices(tx: TenantTx, invoiceIds: readonly string[]): Promise<void> {
  for (const invoiceId of [...invoiceIds].sort()) {
    await tx.$queryRaw`SELECT id FROM hms.invoice WHERE id = ${invoiceId}::uuid FOR UPDATE`;
  }
}

/** The lines and their invoices as they are now, read after the invoice locks. */
export async function readPaymentTargets(
  tx: TenantTx,
  lineIds: readonly string[],
  invoiceIds: readonly string[],
): Promise<{ lines: Map<string, LineState>; invoices: Map<string, InvoiceState> }> {
  const lines = await tx.invoiceLine.findMany({
    where: { id: { in: [...lineIds] } },
    select: { id: true, invoiceId: true, status: true, netAmount: true, allocatedAmount: true },
  });
  const invoices = await tx.invoice.findMany({
    where: { id: { in: [...invoiceIds] } },
    select: {
      id: true,
      patientId: true,
      status: true,
      total: true,
      paid: true,
      _count: { select: { lines: { where: { status: 'ACTIVE' } } } },
    },
  });
  return {
    lines: new Map(
      lines.map((row) => [
        row.id,
        {
          lineId: row.id,
          invoiceId: row.invoiceId,
          status: row.status,
          net: moneyOf(row.netAmount),
          allocated: moneyOf(row.allocatedAmount),
        },
      ]),
    ),
    invoices: new Map(
      invoices.map((row) => [
        row.id,
        {
          invoiceId: row.id,
          patientId: row.patientId,
          status: row.status,
          total: moneyOf(row.total),
          paid: moneyOf(row.paid),
          activeLines: row._count.lines,
        },
      ]),
    ),
  };
}

/** Writes the payment, its allocations, and the new line and invoice amounts of the plan. */
export async function writePayment(
  tx: TenantTx,
  values: {
    tenantId: string;
    receiptNumber: string;
    patientId: string;
    sessionId: string;
    method: string;
    providerLabel: string | null;
    externalReference: string | null;
    amount: Money;
    userId: string;
    at: Date;
    plan: PaymentPlan;
  },
): Promise<string> {
  const payment = await tx.payment.create({
    data: {
      tenantId: values.tenantId,
      receiptNumber: values.receiptNumber,
      patientId: values.patientId,
      cashierSessionId: values.sessionId,
      method: values.method,
      providerLabel: values.providerLabel,
      externalReference: values.externalReference,
      amount: values.amount.toDecimalString(),
      receivedAt: values.at,
      receivedBy: values.userId,
    },
    select: { id: true },
  });
  await tx.paymentAllocation.createMany({
    data: values.plan.allocations.map((allocation) => ({
      tenantId: values.tenantId,
      paymentId: payment.id,
      invoiceId: allocation.invoiceId,
      invoiceLineId: allocation.lineId,
      amount: allocation.amount.toDecimalString(),
      invoiceBalanceAfter: allocation.invoiceBalanceAfter.toDecimalString(),
    })),
  });
  for (const line of values.plan.lines) {
    await tx.invoiceLine.update({
      where: { id: line.lineId },
      data: {
        allocatedAmount: line.allocatedAfter.toDecimalString(),
        eligibility: line.eligibility,
        updatedAt: values.at,
        version: { increment: 1 },
      },
      select: { id: true },
    });
  }
  for (const invoice of values.plan.invoices) {
    await tx.invoice.update({
      where: { id: invoice.invoiceId },
      data: {
        paid: invoice.paidAfter.toDecimalString(),
        status: invoice.status,
        updatedAt: values.at,
        version: { increment: 1 },
      },
      select: { id: true },
    });
  }
  return payment.id;
}

export interface StoredPaidLine {
  lineId: string;
  itemCode: string;
  itemNameEn: string | null;
  itemNameBn: string | null;
  practitionerId: string | null;
  amount: Money;
}

export interface StoredPaidInvoice {
  invoiceId: string;
  number: string;
  type: InvoiceType;
  paid: Money;
  balanceAfter: Money;
  lines: StoredPaidLine[];
}

export interface StoredPayment {
  paymentId: string;
  receiptNumber: string;
  patientId: string;
  sessionId: string;
  method: string;
  providerLabel: string | null;
  externalReference: string | null;
  amount: Money;
  receivedAt: Date;
  receivedBy: string;
  invoices: StoredPaidInvoice[];
  printCount: number;
}

const PAYMENT_COLUMNS = {
  id: true,
  receiptNumber: true,
  patientId: true,
  cashierSessionId: true,
  method: true,
  providerLabel: true,
  externalReference: true,
  amount: true,
  receivedAt: true,
  receivedBy: true,
  _count: { select: { prints: true } },
  allocations: {
    select: {
      amount: true,
      invoiceBalanceAfter: true,
      invoice: { select: { id: true, number: true, type: true } },
      invoiceLine: {
        select: {
          id: true,
          lineNo: true,
          charge: {
            select: {
              practitionerId: true,
              serviceItem: { select: { code: true, nameEn: true, nameBn: true } },
            },
          },
        },
      },
    },
  },
} as const;

type PaymentRow = Awaited<ReturnType<typeof readPaymentRows>>[number];

function readPaymentRows(tx: TenantTx, where: { id?: string; cashierSessionId?: string }) {
  return tx.payment.findMany({ where, select: PAYMENT_COLUMNS, orderBy: { receivedAt: 'desc' } });
}

/** The receipt's invoices: doctor fee first, then services (C-008), lines in posting order. */
function paidInvoicesOf(allocations: PaymentRow['allocations']): StoredPaidInvoice[] {
  const byInvoice = new Map<string, StoredPaidInvoice & { order: number[] }>();
  for (const allocation of allocations) {
    const amount = moneyOf(allocation.amount);
    const current = byInvoice.get(allocation.invoice.id) ?? {
      invoiceId: allocation.invoice.id,
      number: allocation.invoice.number,
      type: allocation.invoice.type as InvoiceType,
      paid: Money.zero(),
      balanceAfter: moneyOf(allocation.invoiceBalanceAfter),
      lines: [],
      order: [],
    };
    current.paid = current.paid.plus(amount);
    current.lines.push({
      lineId: allocation.invoiceLine.id,
      itemCode: allocation.invoiceLine.charge.serviceItem.code,
      itemNameEn: allocation.invoiceLine.charge.serviceItem.nameEn,
      itemNameBn: allocation.invoiceLine.charge.serviceItem.nameBn,
      practitionerId: allocation.invoiceLine.charge.practitionerId,
      amount,
    });
    current.order.push(allocation.invoiceLine.lineNo);
    byInvoice.set(allocation.invoice.id, current);
  }
  return [...byInvoice.values()]
    .sort((left, right) => left.type.localeCompare(right.type))
    .map(({ order, lines, ...invoice }) => ({
      ...invoice,
      lines: lines
        .map((line, index) => ({ line, lineNo: order[index] ?? 0 }))
        .sort((left, right) => left.lineNo - right.lineNo)
        .map(({ line }) => line),
    }));
}

function toStored(row: PaymentRow): StoredPayment {
  return {
    paymentId: row.id,
    receiptNumber: row.receiptNumber,
    patientId: row.patientId,
    sessionId: row.cashierSessionId,
    method: row.method,
    providerLabel: row.providerLabel,
    externalReference: row.externalReference,
    amount: moneyOf(row.amount),
    receivedAt: row.receivedAt,
    receivedBy: row.receivedBy,
    invoices: paidInvoicesOf(row.allocations),
    printCount: row._count.prints,
  };
}

export async function findPayment(tx: TenantTx, paymentId: string): Promise<StoredPayment | null> {
  const [row] = await readPaymentRows(tx, { id: paymentId });
  return row ? toStored(row) : null;
}

/** A session's payments, newest first (the cashier's reprint list). */
export async function listSessionPayments(
  tx: TenantTx,
  sessionId: string,
): Promise<StoredPayment[]> {
  return (await readPaymentRows(tx, { cashierSessionId: sessionId })).map(toStored);
}

/** FR-BIL-026: what each method took in the session, for its expected amounts (T-BIL-03). */
export async function sessionPaymentTotals(
  tx: TenantTx,
  sessionId: string,
): Promise<MethodAmounts> {
  const rows = await tx.payment.groupBy({
    by: ['method'],
    where: { cashierSessionId: sessionId },
    _sum: { amount: true },
  });
  const totals = zeroAmounts();
  for (const row of rows) {
    const method = SESSION_METHODS.find((known) => known === row.method);
    if (method && row._sum.amount) totals[method] = moneyOf(row._sum.amount);
  }
  return totals;
}

/**
 * Records one print of a receipt with the next copy number (FR-BIL-027). A transaction-scoped
 * advisory lock per payment numbers two prints at once one after the other.
 */
export async function recordReceiptPrint(
  tx: TenantTx,
  values: { tenantId: string; paymentId: string; language: string; userId: string; at: Date },
): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${values.tenantId} || ':receipt_print:' || ${values.paymentId}))`;
  const copyNo = (await tx.receiptPrint.count({ where: { paymentId: values.paymentId } })) + 1;
  await tx.receiptPrint.create({
    data: {
      tenantId: values.tenantId,
      paymentId: values.paymentId,
      copyNo,
      language: values.language,
      printedAt: values.at,
      printedBy: values.userId,
    },
    select: { id: true },
  });
  return copyNo;
}
