// Practitioner rows in PostgreSQL (T-PRA-01, T-PRA-02; E section 5.1). Every function runs in the
// caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003). The department is
// read through the row's foreign key, which RLS also limits to the hospital.
import type { Practitioner } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import type { PractitionerValues } from '../domain/practitioner.js';

const COLUMNS = {
  id: true,
  nameBn: true,
  nameEn: true,
  degrees: true,
  specialty: true,
  phone: true,
  registrationNo: true,
  departmentId: true,
  department: { select: { id: true, code: true, nameBn: true, nameEn: true } },
  active: true,
  version: true,
} as const;

type Row = PractitionerValues & {
  id: string;
  active: boolean;
  version: number;
  department: { id: string; code: string; nameBn: string | null; nameEn: string | null } | null;
};

/** The stored values with the active flag and version, as an edit compares them. */
export type StoredPractitioner = PractitionerValues & { active: boolean; version: number };

function toPractitioner(row: Row): Practitioner {
  return {
    practitionerId: row.id,
    nameBn: row.nameBn,
    nameEn: row.nameEn,
    degrees: row.degrees,
    specialty: row.specialty,
    phone: row.phone,
    registrationNo: row.registrationNo,
    department: row.department
      ? {
          departmentId: row.department.id,
          code: row.department.code,
          nameBn: row.department.nameBn,
          nameEn: row.department.nameEn,
        }
      : null,
    active: row.active,
    version: row.version,
  };
}

function toStored(row: Row): StoredPractitioner {
  return {
    nameBn: row.nameBn,
    nameEn: row.nameEn,
    degrees: row.degrees,
    specialty: row.specialty,
    phone: row.phone,
    registrationNo: row.registrationNo,
    departmentId: row.departmentId,
    active: row.active,
    version: row.version,
  };
}

/** Active first, then by name, so a long list shows the doctors in use at the top. */
export async function listPractitioners(tx: TenantTx): Promise<Practitioner[]> {
  const rows = await tx.practitioner.findMany({
    select: COLUMNS,
    orderBy: [{ active: 'desc' }, { nameEn: 'asc' }, { nameBn: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toPractitioner);
}

export async function findPractitioner(
  tx: TenantTx,
  practitionerId: string,
): Promise<Practitioner | null> {
  const row = await tx.practitioner.findUnique({ where: { id: practitionerId }, select: COLUMNS });
  return row ? toPractitioner(row) : null;
}

export async function findStoredPractitioner(
  tx: TenantTx,
  practitionerId: string,
): Promise<StoredPractitioner | null> {
  const row = await tx.practitioner.findUnique({ where: { id: practitionerId }, select: COLUMNS });
  return row ? toStored(row) : null;
}

export async function insertPractitioner(
  tx: TenantTx,
  target: { tenantId: string; userId: string },
  values: PractitionerValues,
): Promise<Practitioner> {
  const row = await tx.practitioner.create({
    data: {
      tenantId: target.tenantId,
      ...values,
      createdBy: target.userId,
      updatedBy: target.userId,
    },
    select: COLUMNS,
  });
  return toPractitioner(row);
}

/**
 * Writes the new values only if the row is still at `expectedVersion` (SP-03). Returns the number
 * of rows changed: 0 means another edit won the race.
 */
export async function updatePractitioner(
  tx: TenantTx,
  target: { practitionerId: string; expectedVersion: number; userId: string; at: Date },
  values: PractitionerValues & { active: boolean },
): Promise<number> {
  const result = await tx.practitioner.updateMany({
    where: { id: target.practitionerId, version: target.expectedVersion },
    data: {
      ...values,
      updatedBy: target.userId,
      updatedAt: target.at,
      version: { increment: 1 },
    },
  });
  return result.count;
}
