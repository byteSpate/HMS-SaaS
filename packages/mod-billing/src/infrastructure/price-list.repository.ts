// Price list rows in PostgreSQL (T-BIL-01; E section 5.4). Every function runs in the caller's
// withTenant() transaction, so RLS limits it to one hospital (ADR-003). Amounts cross the
// boundary here and only here: numeric(18,2) in the database, Money in the code (ADR-007).
import type { TenantTx } from '@hms/database';
import { Money } from '@hms/domain-kernel';
import { DOCTOR_FEE_FOLLOW_UP, DOCTOR_FEE_NEW, type FeeValues } from '../domain/price-list.js';

export interface DoctorFeeItems {
  newPatientItemId: string;
  followUpItemId: string;
}

/**
 * The hospital's two doctor-fee items, created on first use: tenant provisioning (T-SAA-01) does
 * not seed a catalogue yet. ON CONFLICT DO NOTHING lets two first uses race safely.
 */
export async function ensureDoctorFeeItems(
  tx: TenantTx,
  tenantId: string,
): Promise<DoctorFeeItems> {
  await tx.serviceItem.createMany({
    data: [
      {
        tenantId,
        code: DOCTOR_FEE_NEW,
        nameEn: 'Doctor fee, new patient',
        category: 'CONSULTATION',
      },
      {
        tenantId,
        code: DOCTOR_FEE_FOLLOW_UP,
        nameEn: 'Doctor fee, follow-up',
        category: 'CONSULTATION',
      },
    ],
    skipDuplicates: true,
  });
  const items = await tx.serviceItem.findMany({
    where: { code: { in: [DOCTOR_FEE_NEW, DOCTOR_FEE_FOLLOW_UP] } },
    select: { id: true, code: true },
  });
  const idOf = (code: string) => {
    const item = items.find((candidate) => candidate.code === code);
    if (!item) throw new Error(`Service item ${code} is missing`);
    return item.id;
  };
  return { newPatientItemId: idOf(DOCTOR_FEE_NEW), followUpItemId: idOf(DOCTOR_FEE_FOLLOW_UP) };
}

export interface StoredVersion {
  id: string;
  versionNo: number;
  status: string;
  effectiveFrom: Date | null;
  publishedAt: Date | null;
  version: number;
  doctorFeeCount: number;
  /** T-ORD-01: prices of services (items without a practitioner). */
  servicePriceCount: number;
}

const VERSION_COLUMNS = {
  id: true,
  versionNo: true,
  status: true,
  effectiveFrom: true,
  publishedAt: true,
  version: true,
  _count: { select: { items: { where: { serviceItem: { code: DOCTOR_FEE_NEW } } } } },
} as const;

type VersionRow = Omit<StoredVersion, 'doctorFeeCount' | 'servicePriceCount'> & {
  _count: { items: number };
};

/** How many service prices each version has; one query for a whole list. */
async function servicePriceCounts(
  tx: TenantTx,
  versionIds: readonly string[],
): Promise<Map<string, number>> {
  if (versionIds.length === 0) return new Map();
  const rows = await tx.priceListItem.groupBy({
    by: ['priceListVersionId'],
    where: { priceListVersionId: { in: [...versionIds] }, practitionerId: null },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.priceListVersionId, row._count._all]));
}

async function toStoredVersions(tx: TenantTx, rows: VersionRow[]): Promise<StoredVersion[]> {
  const counts = await servicePriceCounts(
    tx,
    rows.map((row) => row.id),
  );
  return rows.map(({ _count, ...row }) => ({
    ...row,
    doctorFeeCount: _count.items,
    servicePriceCount: counts.get(row.id) ?? 0,
  }));
}

/** Newest first: the draft, then the published versions by number. */
export async function listVersions(tx: TenantTx): Promise<StoredVersion[]> {
  const rows = await tx.priceListVersion.findMany({
    select: VERSION_COLUMNS,
    orderBy: { versionNo: 'desc' },
  });
  return toStoredVersions(tx, rows);
}

export async function findVersion(tx: TenantTx, id: string): Promise<StoredVersion | null> {
  const row = await tx.priceListVersion.findUnique({ where: { id }, select: VERSION_COLUMNS });
  return row ? ((await toStoredVersions(tx, [row]))[0] ?? null) : null;
}

/** FR-BIL-007: the published version with the latest effective time not after `at`. */
export async function findVersionInForce(tx: TenantTx, at: Date): Promise<StoredVersion | null> {
  const row = await tx.priceListVersion.findFirst({
    where: { status: 'PUBLISHED', effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'desc' },
    select: VERSION_COLUMNS,
  });
  return row ? ((await toStoredVersions(tx, [row]))[0] ?? null) : null;
}

/** T-ORD-01: a version's service prices (items without a practitioner), keyed by item. */
export async function servicePricesOf(
  tx: TenantTx,
  versionId: string,
): Promise<Map<string, Money>> {
  const rows = await tx.priceListItem.findMany({
    where: { priceListVersionId: versionId, practitionerId: null },
    select: { serviceItemId: true, unitPrice: true },
  });
  return new Map(rows.map((row) => [row.serviceItemId, Money.parse(row.unitPrice.toFixed(2))]));
}

/** Replaces one service's price in the draft (the trigger refuses any other version). */
export async function writeServicePrice(
  tx: TenantTx,
  target: { tenantId: string; versionId: string; serviceItemId: string },
  unitPrice: Money,
): Promise<void> {
  await removeServicePrice(tx, target.versionId, target.serviceItemId);
  await tx.priceListItem.create({
    data: {
      tenantId: target.tenantId,
      priceListVersionId: target.versionId,
      serviceItemId: target.serviceItemId,
      unitPrice: unitPrice.toDecimalString(),
    },
  });
}

/** Returns how many rows went: 0 means the service had no price in the draft. */
export async function removeServicePrice(
  tx: TenantTx,
  versionId: string,
  serviceItemId: string,
): Promise<number> {
  const result = await tx.priceListItem.deleteMany({
    where: { priceListVersionId: versionId, serviceItemId, practitionerId: null },
  });
  return result.count;
}

/** A version's doctor fees, keyed by practitioner. */
export async function doctorFeesOf(
  tx: TenantTx,
  versionId: string,
): Promise<Map<string, FeeValues>> {
  const rows = await tx.priceListItem.findMany({
    where: {
      priceListVersionId: versionId,
      practitionerId: { not: null },
      serviceItem: { code: { in: [DOCTOR_FEE_NEW, DOCTOR_FEE_FOLLOW_UP] } },
    },
    select: {
      practitionerId: true,
      unitPrice: true,
      followUpDays: true,
      serviceItem: { select: { code: true } },
    },
  });
  const parts = new Map<string, Partial<FeeValues>>();
  for (const row of rows) {
    if (!row.practitionerId) continue;
    const fee = parts.get(row.practitionerId) ?? {};
    const amount = Money.parse(row.unitPrice.toFixed(2));
    if (row.serviceItem.code === DOCTOR_FEE_NEW) fee.newPatientFee = amount;
    else {
      fee.followUpFee = amount;
      fee.followUpDays = row.followUpDays ?? 0;
    }
    parts.set(row.practitionerId, fee);
  }
  const fees = new Map<string, FeeValues>();
  // Both rows are always written together, so a half fee would be a defect, not a fee.
  for (const [practitionerId, fee] of parts) {
    if (fee.newPatientFee && fee.followUpFee && fee.followUpDays) {
      fees.set(practitionerId, {
        newPatientFee: fee.newPatientFee,
        followUpFee: fee.followUpFee,
        followUpDays: fee.followUpDays,
      });
    }
  }
  return fees;
}

/**
 * Creates the draft as a copy of the newest published version, so an edit starts from the
 * prices the hospital has. A transaction-scoped advisory lock serializes two administrators
 * pressing "new draft" at once; the second then sees the first draft and gets null.
 */
export async function createDraft(
  tx: TenantTx,
  values: { tenantId: string; userId: string; at: Date },
): Promise<string | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${values.tenantId} || ':price_list_draft'))`;
  const existing = await tx.priceListVersion.findFirst({
    where: { status: 'DRAFT' },
    select: { id: true },
  });
  if (existing) return null;
  const newest = await tx.priceListVersion.findFirst({
    orderBy: { versionNo: 'desc' },
    select: { versionNo: true },
  });
  const source = await tx.priceListVersion.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { versionNo: 'desc' },
    select: { id: true },
  });
  const draft = await tx.priceListVersion.create({
    data: {
      tenantId: values.tenantId,
      versionNo: (newest?.versionNo ?? 0) + 1,
      createdAt: values.at,
      createdBy: values.userId,
      updatedAt: values.at,
      updatedBy: values.userId,
    },
    select: { id: true },
  });
  if (source) {
    const items = await tx.priceListItem.findMany({
      where: { priceListVersionId: source.id },
      select: { serviceItemId: true, practitionerId: true, unitPrice: true, followUpDays: true },
    });
    await tx.priceListItem.createMany({
      data: items.map((item) => ({
        tenantId: values.tenantId,
        priceListVersionId: draft.id,
        ...item,
      })),
    });
  }
  return draft.id;
}

/** Replaces one doctor's two fee rows in the draft (the trigger refuses any other version). */
export async function writeDoctorFee(
  tx: TenantTx,
  target: { tenantId: string; versionId: string; practitionerId: string; items: DoctorFeeItems },
  fee: FeeValues,
): Promise<void> {
  await removeDoctorFee(tx, target.versionId, target.practitionerId);
  await tx.priceListItem.createMany({
    data: [
      {
        tenantId: target.tenantId,
        priceListVersionId: target.versionId,
        serviceItemId: target.items.newPatientItemId,
        practitionerId: target.practitionerId,
        unitPrice: fee.newPatientFee.toDecimalString(),
      },
      {
        tenantId: target.tenantId,
        priceListVersionId: target.versionId,
        serviceItemId: target.items.followUpItemId,
        practitionerId: target.practitionerId,
        unitPrice: fee.followUpFee.toDecimalString(),
        followUpDays: fee.followUpDays,
      },
    ],
  });
}

/** Returns how many rows went: 0 means the doctor had no fee in the draft. */
export async function removeDoctorFee(
  tx: TenantTx,
  versionId: string,
  practitionerId: string,
): Promise<number> {
  const result = await tx.priceListItem.deleteMany({
    where: { priceListVersionId: versionId, practitionerId },
  });
  return result.count;
}

/** SP-03: the edit wins only against the version the screen showed. Returns rows changed. */
export async function touchDraft(
  tx: TenantTx,
  target: { versionId: string; expectedVersion: number; userId: string; at: Date },
): Promise<number> {
  const result = await tx.priceListVersion.updateMany({
    where: { id: target.versionId, status: 'DRAFT', version: target.expectedVersion },
    data: { updatedAt: target.at, updatedBy: target.userId, version: { increment: 1 } },
  });
  return result.count;
}

export async function publishDraft(
  tx: TenantTx,
  target: {
    versionId: string;
    expectedVersion: number;
    effectiveFrom: Date;
    userId: string;
    at: Date;
  },
): Promise<number> {
  const result = await tx.priceListVersion.updateMany({
    where: { id: target.versionId, status: 'DRAFT', version: target.expectedVersion },
    data: {
      status: 'PUBLISHED',
      effectiveFrom: target.effectiveFrom,
      publishedAt: target.at,
      publishedBy: target.userId,
      updatedAt: target.at,
      updatedBy: target.userId,
      version: { increment: 1 },
    },
  });
  return result.count;
}

/** Whether another published version already takes effect at exactly this instant. */
export async function hasVersionEffectiveAt(tx: TenantTx, at: Date): Promise<boolean> {
  const row = await tx.priceListVersion.findFirst({
    where: { status: 'PUBLISHED', effectiveFrom: at },
    select: { id: true },
  });
  return row !== null;
}
