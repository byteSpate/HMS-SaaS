// Charge, invoice and invoice-line rows in PostgreSQL (T-BIL-02, T-BIL-04; E section 5.4). Every function
// runs in the caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003).
// Amounts cross the boundary here only: numeric in the database, Money in the code (ADR-007).
import type { TenantTx } from '@hms/database';
import { Money } from '@hms/domain-kernel';
import type { ChargeContent, InvoiceStatus, InvoiceType, LineCategory } from '../domain/invoice.js';

const moneyOf = (value: { toFixed(digits: number): string }) => Money.parse(value.toFixed(2));

export interface SourceReference {
  module: string;
  type: string;
  id: string;
  event: string;
}

export interface StoredCharge extends ChargeContent {
  chargeId: string;
  invoiceId: string;
  lineId: string;
}

/** FR-BIL-006: the charge already posted under this source reference, if any. */
export async function findChargeBySource(
  tx: TenantTx,
  source: SourceReference,
): Promise<StoredCharge | null> {
  const row = await tx.charge.findFirst({
    where: {
      sourceModule: source.module,
      sourceType: source.type,
      sourceId: source.id,
      sourceEvent: source.event,
    },
    select: {
      id: true,
      patientId: true,
      visitId: true,
      serviceItemId: true,
      practitionerId: true,
      quantity: true,
      line: { select: { id: true, invoiceId: true } },
    },
  });
  if (!row?.line) return null;
  return {
    chargeId: row.id,
    invoiceId: row.line.invoiceId,
    lineId: row.line.id,
    patientId: row.patientId,
    visitId: row.visitId,
    serviceItemId: row.serviceItemId,
    practitionerId: row.practitionerId,
    quantity: Number(row.quantity),
  };
}

export async function findServiceItem(
  tx: TenantTx,
  code: string,
): Promise<{ id: string; category: string } | null> {
  return tx.serviceItem.findFirst({
    where: { code, active: true },
    select: { id: true, category: true },
  });
}

/** The unit price of an item (for a practitioner, for doctor fees) in a price list version. */
export async function findUnitPrice(
  tx: TenantTx,
  target: { versionId: string; serviceItemId: string; practitionerId: string | null },
): Promise<Money | null> {
  const row = await tx.priceListItem.findFirst({
    where: {
      priceListVersionId: target.versionId,
      serviceItemId: target.serviceItemId,
      practitionerId: target.practitionerId,
    },
    select: { unitPrice: true },
  });
  return row ? moneyOf(row.unitPrice) : null;
}

export async function findVisitInvoiceId(
  tx: TenantTx,
  visitId: string,
  type: InvoiceType,
): Promise<string | null> {
  const row = await tx.invoice.findFirst({ where: { visitId, type }, select: { id: true } });
  return row?.id ?? null;
}

/**
 * Creates the visit's invoice of this type. ON CONFLICT DO NOTHING on the one-per-visit index:
 * if a concurrent posting created it first, this one uses theirs (its number is then skipped,
 * which FR-CFG-003 allows: numbers are unique, not gap-free).
 */
export async function createVisitInvoice(
  tx: TenantTx,
  values: {
    tenantId: string;
    type: InvoiceType;
    number: string;
    patientId: string;
    visitId: string;
    userId: string;
    at: Date;
  },
): Promise<string> {
  await tx.invoice.createMany({
    data: [
      {
        tenantId: values.tenantId,
        type: values.type,
        number: values.number,
        patientId: values.patientId,
        visitId: values.visitId,
        issuedAt: values.at,
        issuedBy: values.userId,
        updatedAt: values.at,
      },
    ],
    skipDuplicates: true,
  });
  const id = await findVisitInvoiceId(tx, values.visitId, values.type);
  if (!id) throw new Error('The visit invoice was not created');
  return id;
}

export async function insertCharge(
  tx: TenantTx,
  values: ChargeContent & {
    tenantId: string;
    source: SourceReference;
    unitPrice: Money;
    amount: Money;
    priceListVersionId: string;
    serviceTime: Date;
    userId: string;
    at: Date;
  },
): Promise<string> {
  const row = await tx.charge.create({
    data: {
      tenantId: values.tenantId,
      patientId: values.patientId,
      visitId: values.visitId,
      serviceItemId: values.serviceItemId,
      practitionerId: values.practitionerId,
      sourceModule: values.source.module,
      sourceType: values.source.type,
      sourceId: values.source.id,
      sourceEvent: values.source.event,
      quantity: values.quantity,
      unitPrice: values.unitPrice.toDecimalString(),
      amount: values.amount.toDecimalString(),
      priceListVersionId: values.priceListVersionId,
      serviceTime: values.serviceTime,
      postedAt: values.at,
      postedBy: values.userId,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Adds the line and raises the invoice total in one step. The UPDATE comes first: it locks the
 * invoice row, so concurrent postings to one invoice number their lines one after the other and
 * the total always equals the sum of the lines (FR-BIL-031).
 */
export async function appendLine(
  tx: TenantTx,
  values: {
    tenantId: string;
    invoiceId: string;
    chargeId: string;
    category: LineCategory;
    amount: Money;
    at: Date;
  },
): Promise<string> {
  await tx.invoice.update({
    where: { id: values.invoiceId },
    data: {
      total: { increment: values.amount.toDecimalString() },
      updatedAt: values.at,
      version: { increment: 1 },
    },
    select: { id: true },
  });
  const lines = await tx.invoiceLine.count({ where: { invoiceId: values.invoiceId } });
  const row = await tx.invoiceLine.create({
    data: {
      tenantId: values.tenantId,
      invoiceId: values.invoiceId,
      chargeId: values.chargeId,
      lineNo: lines + 1,
      category: values.category,
      netAmount: values.amount.toDecimalString(),
      updatedAt: values.at,
    },
    select: { id: true },
  });
  return row.id;
}

export async function invoiceAmounts(
  tx: TenantTx,
  invoiceId: string,
): Promise<{ total: Money; paid: Money; activeLines: number }> {
  const row = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      total: true,
      paid: true,
      _count: { select: { lines: { where: { status: 'ACTIVE' } } } },
    },
  });
  return { total: moneyOf(row.total), paid: moneyOf(row.paid), activeLines: row._count.lines };
}

export async function setInvoiceStatus(
  tx: TenantTx,
  invoiceId: string,
  status: InvoiceStatus,
): Promise<void> {
  await tx.invoice.update({ where: { id: invoiceId }, data: { status }, select: { id: true } });
}

const INVOICE_COLUMNS = {
  id: true,
  number: true,
  type: true,
  status: true,
  patientId: true,
  visitId: true,
  currency: true,
  total: true,
  paid: true,
  issuedAt: true,
  version: true,
  lines: {
    orderBy: { lineNo: 'asc' },
    select: {
      id: true,
      lineNo: true,
      category: true,
      netAmount: true,
      status: true,
      allocatedAmount: true,
      eligibility: true,
      charge: {
        select: {
          practitionerId: true,
          quantity: true,
          unitPrice: true,
          serviceItem: { select: { code: true, nameEn: true, nameBn: true } },
        },
      },
    },
  },
} as const;

export interface StoredLine {
  lineId: string;
  lineNo: number;
  itemCode: string;
  itemNameEn: string | null;
  itemNameBn: string | null;
  practitionerId: string | null;
  quantity: number;
  unitPrice: Money;
  amount: Money;
  category: LineCategory;
  status: string;
  /** T-BIL-04: paid so far. */
  allocated: Money;
  eligibility: string;
}

export interface StoredInvoice {
  invoiceId: string;
  number: string;
  type: InvoiceType;
  status: InvoiceStatus;
  patientId: string;
  visitId: string;
  currency: string;
  total: Money;
  paid: Money;
  issuedAt: Date;
  version: number;
  lines: StoredLine[];
}

type InvoiceRow = NonNullable<Awaited<ReturnType<typeof readInvoiceRow>>>;

function readInvoiceRow(tx: TenantTx, invoiceId: string) {
  return tx.invoice.findUnique({ where: { id: invoiceId }, select: INVOICE_COLUMNS });
}

function toStored(row: InvoiceRow): StoredInvoice {
  return {
    invoiceId: row.id,
    number: row.number,
    type: row.type as InvoiceType,
    status: row.status as InvoiceStatus,
    patientId: row.patientId,
    visitId: row.visitId,
    currency: row.currency,
    total: moneyOf(row.total),
    paid: moneyOf(row.paid),
    issuedAt: row.issuedAt,
    version: row.version,
    lines: row.lines.map((line) => ({
      lineId: line.id,
      lineNo: line.lineNo,
      itemCode: line.charge.serviceItem.code,
      itemNameEn: line.charge.serviceItem.nameEn,
      itemNameBn: line.charge.serviceItem.nameBn,
      practitionerId: line.charge.practitionerId,
      quantity: Number(line.charge.quantity),
      unitPrice: moneyOf(line.charge.unitPrice),
      amount: moneyOf(line.netAmount),
      category: line.category as LineCategory,
      status: line.status,
      allocated: moneyOf(line.allocatedAmount),
      eligibility: line.eligibility,
    })),
  };
}

export async function findInvoice(tx: TenantTx, invoiceId: string): Promise<StoredInvoice | null> {
  const row = await readInvoiceRow(tx, invoiceId);
  return row ? toStored(row) : null;
}

const OPEN_STATUSES = ['ISSUED', 'PARTIALLY_PAID'];

/**
 * A visit's or a patient's invoices: doctor fees first, then services (C-008), older first.
 * `openOnly` keeps those that still owe money (the cashier desk, T-BIL-04).
 */
export async function listInvoices(
  tx: TenantTx,
  filter: { visitId?: string; patientId?: string; openOnly?: boolean },
): Promise<StoredInvoice[]> {
  const rows = await tx.invoice.findMany({
    where: {
      ...(filter.visitId ? { visitId: filter.visitId } : {}),
      ...(filter.patientId ? { patientId: filter.patientId } : {}),
      ...(filter.openOnly ? { status: { in: OPEN_STATUSES } } : {}),
    },
    select: INVOICE_COLUMNS,
    orderBy: [{ type: 'asc' }, { issuedAt: 'asc' }],
  });
  return rows.map(toStored);
}

/** T-BIL-04 cashier queue: invoices still owing that were issued from `since`, newest first. */
export async function listOpenInvoicesSince(tx: TenantTx, since: Date): Promise<StoredInvoice[]> {
  const rows = await tx.invoice.findMany({
    where: { status: { in: OPEN_STATUSES }, issuedAt: { gte: since } },
    select: INVOICE_COLUMNS,
    orderBy: { issuedAt: 'desc' },
    take: 200,
  });
  return rows.map(toStored);
}
