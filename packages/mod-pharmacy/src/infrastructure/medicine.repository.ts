// Medicine catalogue rows in PostgreSQL (T-CLI-03; FR-CLI-004, FR-PHA-011 subset). Every function
// runs in the caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003).
import { MEDICINE_SEARCH_LIMIT, type MedicineChoice, type MedicineRecord } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import { medicineIdentityOf, type MedicineValues } from '../domain/catalogue.js';

const COLUMNS = {
  id: true,
  brandName: true,
  genericName: true,
  strength: true,
  form: true,
  nameBn: true,
  manufacturer: true,
  active: true,
  version: true,
} as const;

const CHOICE = {
  id: true,
  brandName: true,
  genericName: true,
  strength: true,
  form: true,
  nameBn: true,
} as const;

type Row = MedicineValues & { id: string; active: boolean; version: number };

function toMedicine({ id, ...rest }: Row): MedicineRecord {
  return { medicineId: id, ...rest };
}

function toChoice({ id, ...rest }: Omit<MedicineValues, 'manufacturer'> & { id: string }) {
  return { medicineId: id, ...rest } satisfies MedicineChoice;
}

/** Active first, then by brand and strength, the order the administrator's list shows. */
export async function listMedicines(tx: TenantTx): Promise<MedicineRecord[]> {
  const rows = await tx.medicine.findMany({
    select: COLUMNS,
    orderBy: [{ active: 'desc' }, { brandName: 'asc' }, { strength: 'asc' }],
  });
  return rows.map(toMedicine);
}

export async function findMedicine(
  tx: TenantTx,
  medicineId: string,
): Promise<MedicineRecord | null> {
  const row = await tx.medicine.findUnique({ where: { id: medicineId }, select: COLUMNS });
  return row ? toMedicine(row) : null;
}

/**
 * Whether another medicine of the hospital has the same brand, strength and form in any letter
 * case. Checked first so the administrator gets a field error; medicine_identity_key is the
 * last guard.
 */
export async function identityTaken(
  tx: TenantTx,
  values: MedicineValues,
  exceptMedicineId?: string,
): Promise<boolean> {
  const rows = await tx.medicine.findMany({
    where: {
      brandName: { equals: values.brandName, mode: 'insensitive' },
      ...(exceptMedicineId ? { id: { not: exceptMedicineId } } : {}),
    },
    select: { brandName: true, genericName: true, strength: true, form: true, nameBn: true },
  });
  const identity = medicineIdentityOf(values);
  return rows.some((row) => medicineIdentityOf({ ...row, manufacturer: null }) === identity);
}

export async function insertMedicine(
  tx: TenantTx,
  target: { tenantId: string; userId: string },
  values: MedicineValues,
): Promise<MedicineRecord> {
  const row = await tx.medicine.create({
    data: {
      tenantId: target.tenantId,
      ...values,
      createdBy: target.userId,
      updatedBy: target.userId,
    },
    select: COLUMNS,
  });
  return toMedicine(row);
}

/** Writes only if the row is still at `expectedVersion` (SP-03); 0 means another edit won. */
export async function updateMedicine(
  tx: TenantTx,
  target: { medicineId: string; expectedVersion: number; userId: string; at: Date },
  values: MedicineValues & { active: boolean },
): Promise<number> {
  const result = await tx.medicine.updateMany({
    where: { id: target.medicineId, version: target.expectedVersion },
    data: {
      ...values,
      updatedBy: target.userId,
      updatedAt: target.at,
      version: { increment: 1 },
    },
  });
  return result.count;
}

/** The doctor's picker: active medicines whose brand or generic name contains the text. */
export async function searchMedicineChoices(tx: TenantTx, text: string): Promise<MedicineChoice[]> {
  const rows = await tx.medicine.findMany({
    where: {
      active: true,
      OR: [
        { brandName: { contains: text, mode: 'insensitive' } },
        { genericName: { contains: text, mode: 'insensitive' } },
      ],
    },
    select: CHOICE,
    orderBy: [{ brandName: 'asc' }, { strength: 'asc' }],
    take: MEDICINE_SEARCH_LIMIT,
  });
  return rows.map(toChoice);
}

/**
 * The active medicines among the IDs, by ID, as a prescription line keeps them (T-CLI-03). An
 * inactive or unknown ID is missing from the map, so the caller can refuse the line.
 */
export async function findActiveMedicineChoices(
  tx: TenantTx,
  medicineIds: readonly string[],
): Promise<Map<string, MedicineChoice>> {
  if (medicineIds.length === 0) return new Map();
  const rows = await tx.medicine.findMany({
    where: { id: { in: [...new Set(medicineIds)] }, active: true },
    select: CHOICE,
  });
  return new Map(rows.map((row) => [row.id, toChoice(row)]));
}
