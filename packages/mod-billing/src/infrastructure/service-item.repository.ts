// Service catalogue rows in PostgreSQL (T-ORD-01; FR-ORD-001, FR-ORD-007, FR-CFG-001). The
// orderable services of billing's service_item: lab, imaging, procedures and other services.
// Doctor-fee items (CONSULTATION) are system items and never appear here. Every function runs
// in the caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003).
import {
  ORDERABLE_CATEGORIES,
  type OrderableCategory,
  type OrderableService,
  type ServiceChoice,
  type ServiceRecord,
} from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import { Money } from '@hms/domain-kernel';

const ORDERABLE: { category: { in: string[] } } = { category: { in: [...ORDERABLE_CATEGORIES] } };

const COLUMNS = {
  id: true,
  code: true,
  category: true,
  nameBn: true,
  nameEn: true,
  directlyOrderable: true,
  reportHours: true,
  active: true,
  version: true,
} as const;

type Row = {
  id: string;
  code: string;
  category: string;
  nameBn: string | null;
  nameEn: string | null;
  directlyOrderable: boolean;
  reportHours: number | null;
  active: boolean;
  version: number;
};

// The query filters to the orderable categories, so the cast only narrows the type.
const categoryOf = (category: string) => category as OrderableCategory;

function toRecord({ id, category, ...rest }: Row): ServiceRecord {
  return { serviceItemId: id, category: categoryOf(category), ...rest };
}

export interface ServiceValues {
  nameBn: string | null;
  nameEn: string | null;
  directlyOrderable: boolean;
  reportHours: number | null;
}

/** Active first, then by category and code. */
export async function listServices(tx: TenantTx): Promise<ServiceRecord[]> {
  const rows = await tx.serviceItem.findMany({
    where: ORDERABLE,
    select: COLUMNS,
    orderBy: [{ active: 'desc' }, { category: 'asc' }, { code: 'asc' }],
  });
  return rows.map(toRecord);
}

export async function findService(
  tx: TenantTx,
  serviceItemId: string,
): Promise<ServiceRecord | null> {
  const row = await tx.serviceItem.findFirst({
    where: { id: serviceItemId, ...ORDERABLE },
    select: COLUMNS,
  });
  return row ? toRecord(row) : null;
}

/** Codes are unique per hospital across every item, doctor-fee items included. */
export async function serviceCodeTaken(tx: TenantTx, code: string): Promise<boolean> {
  return (await tx.serviceItem.findFirst({ where: { code }, select: { id: true } })) !== null;
}

export async function insertService(
  tx: TenantTx,
  tenantId: string,
  values: ServiceValues & { code: string; category: OrderableCategory; at: Date },
): Promise<ServiceRecord> {
  const { at, ...fields } = values;
  const row = await tx.serviceItem.create({
    data: { tenantId, ...fields, createdAt: at, updatedAt: at },
    select: COLUMNS,
  });
  return toRecord(row);
}

/** Writes only if the row is still at `expectedVersion` (SP-03); 0 means another edit won. */
export async function updateService(
  tx: TenantTx,
  target: { serviceItemId: string; expectedVersion: number; at: Date },
  values: ServiceValues & { active: boolean },
): Promise<number> {
  const result = await tx.serviceItem.updateMany({
    where: { id: target.serviceItemId, version: target.expectedVersion, ...ORDERABLE },
    data: { ...values, updatedAt: target.at, version: { increment: 1 } },
  });
  return result.count;
}

/** The services as other records name them, by ID (a price list's rows). */
export async function findServiceChoices(
  tx: TenantTx,
  serviceItemIds: readonly string[],
): Promise<Map<string, ServiceChoice>> {
  if (serviceItemIds.length === 0) return new Map();
  const rows = await tx.serviceItem.findMany({
    where: { id: { in: [...new Set(serviceItemIds)] }, ...ORDERABLE },
    select: { id: true, code: true, category: true, nameBn: true, nameEn: true },
  });
  return new Map(
    rows.map(({ id, category, ...rest }) => [
      id,
      { serviceItemId: id, category: categoryOf(category), ...rest },
    ]),
  );
}

const ORDERABLE_COLUMNS = {
  id: true,
  code: true,
  category: true,
  nameBn: true,
  nameEn: true,
  directlyOrderable: true,
  reportHours: true,
  version: true,
} as const;

export const ORDERABLE_SEARCH_LIMIT = 20;

/**
 * Active services with a price in the given version, for an order picker (T-ORD-01): matching
 * the text in the code or either name, or one service by ID. `directOnly` keeps those reception
 * may order without a doctor (FR-ORD-001). A service without a price cannot be ordered, since
 * the order's charge would be refused (FR-BIL-007).
 */
export async function findOrderableServices(
  tx: TenantTx,
  query: { versionId: string; text?: string; serviceItemId?: string; directOnly: boolean },
): Promise<OrderableService[]> {
  const text = query.text;
  const rows = await tx.serviceItem.findMany({
    where: {
      ...ORDERABLE,
      active: true,
      ...(query.directOnly ? { directlyOrderable: true } : {}),
      ...(query.serviceItemId ? { id: query.serviceItemId } : {}),
      ...(text
        ? {
            OR: [
              { code: { contains: text, mode: 'insensitive' } },
              { nameEn: { contains: text, mode: 'insensitive' } },
              { nameBn: { contains: text } },
            ],
          }
        : {}),
      priceListItems: { some: { priceListVersionId: query.versionId, practitionerId: null } },
    },
    select: {
      ...ORDERABLE_COLUMNS,
      priceListItems: {
        where: { priceListVersionId: query.versionId, practitionerId: null },
        select: { unitPrice: true },
        take: 1,
      },
    },
    orderBy: [{ category: 'asc' }, { code: 'asc' }],
    take: ORDERABLE_SEARCH_LIMIT,
  });
  return rows.flatMap(({ id, category, priceListItems, ...rest }) => {
    const price = priceListItems[0];
    if (!price) return [];
    return [
      {
        serviceItemId: id,
        category: categoryOf(category),
        ...rest,
        unitPrice: Money.parse(price.unitPrice.toFixed(2)).toDecimalString(),
      },
    ];
  });
}
