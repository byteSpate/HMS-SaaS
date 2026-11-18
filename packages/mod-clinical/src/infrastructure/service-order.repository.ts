// Service order rows in PostgreSQL (T-ORD-01, T-VIS-02, T-ORD-03; FR-ORD-002, FR-ORD-004). Every
// function runs in the caller's withTenant() transaction, so RLS limits it to one hospital
// (ADR-003). Only the fulfilment state of an order changes after it is written.
import type { OrderPriority, OrderSource, OrderStatus, OrderableCategory } from '@hms/contracts';
import type { TenantTx } from '@hms/database';

export interface StoredOrder {
  orderId: string;
  visitId: string;
  patientId: string;
  consultationId: string | null;
  source: OrderSource;
  requestedBy: string;
  service: {
    serviceItemId: string;
    code: string;
    category: OrderableCategory;
    nameBn: string | null;
    nameEn: string | null;
  };
  reportHours: number | null;
  priority: OrderPriority;
  clinicalNote: string | null;
  status: OrderStatus;
  invoiceLineId: string;
  cancelReason: string | null;
  createdAt: Date;
  version: number;
}

const COLUMNS = {
  id: true,
  visitId: true,
  patientId: true,
  consultationId: true,
  source: true,
  requestedBy: true,
  serviceItemId: true,
  serviceCode: true,
  serviceNameBn: true,
  serviceNameEn: true,
  category: true,
  reportHours: true,
  priority: true,
  clinicalNote: true,
  status: true,
  invoiceLineId: true,
  cancelReason: true,
  createdAt: true,
  version: true,
} as const;

type Row = {
  id: string;
  visitId: string;
  patientId: string;
  consultationId: string | null;
  source: string;
  requestedBy: string;
  serviceItemId: string;
  serviceCode: string;
  serviceNameBn: string | null;
  serviceNameEn: string | null;
  category: string;
  reportHours: number | null;
  priority: string;
  clinicalNote: string | null;
  status: string;
  invoiceLineId: string;
  cancelReason: string | null;
  createdAt: Date;
  version: number;
};

// The CHECK constraints allow only the contract's values, so the casts only narrow the types.
function toStored(row: Row): StoredOrder {
  return {
    orderId: row.id,
    visitId: row.visitId,
    patientId: row.patientId,
    consultationId: row.consultationId,
    source: row.source as OrderSource,
    requestedBy: row.requestedBy,
    service: {
      serviceItemId: row.serviceItemId,
      code: row.serviceCode,
      category: row.category as OrderableCategory,
      nameBn: row.serviceNameBn,
      nameEn: row.serviceNameEn,
    },
    reportHours: row.reportHours,
    priority: row.priority as OrderPriority,
    clinicalNote: row.clinicalNote,
    status: row.status as OrderStatus,
    invoiceLineId: row.invoiceLineId,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
    version: row.version,
  };
}

export interface NewOrder {
  id: string;
  tenantId: string;
  visitId: string;
  patientId: string;
  consultationId: string | null;
  source: OrderSource;
  requestedBy: string;
  requestingPractitionerId: string | null;
  serviceItemId: string;
  serviceItemVersion: number;
  serviceCode: string;
  serviceNameEn: string | null;
  serviceNameBn: string | null;
  category: string;
  reportHours: number | null;
  priority: OrderPriority;
  clinicalNote: string | null;
  chargeId: string;
  invoiceLineId: string;
  at: Date;
}

export async function insertOrder(tx: TenantTx, order: NewOrder): Promise<void> {
  const { at, ...fields } = order;
  await tx.serviceOrder.create({ data: { ...fields, createdAt: at, updatedAt: at } });
}

/**
 * A visit's orders in the order they were placed. Orders placed together share their time, so
 * the tie is broken by their line number on the visit's service invoice, which grows with each.
 */
export async function listOrdersOfVisit(tx: TenantTx, visitId: string): Promise<StoredOrder[]> {
  const rows = await tx.serviceOrder.findMany({
    where: { visitId },
    select: COLUMNS,
    orderBy: [{ createdAt: 'asc' }, { invoiceLine: { lineNo: 'asc' } }],
  });
  return rows.map(toStored);
}

export async function findOrder(tx: TenantTx, orderId: string): Promise<StoredOrder | null> {
  const row = await tx.serviceOrder.findUnique({ where: { id: orderId }, select: COLUMNS });
  return row ? toStored(row) : null;
}

/** UC-ORD-02: only a REQUESTED order at the expected version is cancelled; 0 rows otherwise. */
export async function markCancelled(
  tx: TenantTx,
  target: { orderId: string; expectedVersion: number; reason: string; userId: string; at: Date },
): Promise<number> {
  const result = await tx.serviceOrder.updateMany({
    where: { id: target.orderId, version: target.expectedVersion, status: 'REQUESTED' },
    data: {
      status: 'CANCELLED',
      cancelReason: target.reason,
      cancelledAt: target.at,
      cancelledBy: target.userId,
      updatedAt: target.at,
      version: { increment: 1 },
    },
  });
  return result.count;
}
