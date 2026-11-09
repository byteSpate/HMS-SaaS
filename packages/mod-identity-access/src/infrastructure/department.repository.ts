// Department rows in PostgreSQL (T-PRA-02; FR-CFG-001; E section 4). Every function runs in the
// caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003).
import type { DepartmentChoice, DepartmentRecord } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import type { DepartmentValues } from '../domain/department.js';

const COLUMNS = {
  id: true,
  code: true,
  nameBn: true,
  nameEn: true,
  active: true,
  version: true,
} as const;

/** The facility a hospital gets when it has none yet (C-024: one facility per hospital). */
const MAIN_FACILITY_CODE = 'MAIN';

type Row = DepartmentValues & { id: string; active: boolean; version: number };

function toDepartment({ id, ...rest }: Row): DepartmentRecord {
  return { departmentId: id, ...rest };
}

/**
 * The hospital's facility. Tenant provisioning (T-SAA-01) does not create one yet, so the first
 * department creates it; ON CONFLICT DO NOTHING keeps two first saves from making two.
 */
export async function hospitalFacilityId(tx: TenantTx, tenantId: string): Promise<string> {
  const existing = await tx.facility.findFirst({ orderBy: { code: 'asc' }, select: { id: true } });
  if (existing) return existing.id;
  await tx.facility.createMany({
    data: [{ tenantId, code: MAIN_FACILITY_CODE }],
    skipDuplicates: true,
  });
  const created = await tx.facility.findFirstOrThrow({
    where: { code: MAIN_FACILITY_CODE },
    select: { id: true },
  });
  return created.id;
}

const CHOICE = { id: true, code: true, nameBn: true, nameEn: true } as const;

/**
 * The active departments as choices for other modules' forms (a practitioner's department,
 * T-PRA-02 part 2), by code. Exported from the package, so only this module reads the table.
 */
export async function listDepartmentChoices(tx: TenantTx): Promise<DepartmentChoice[]> {
  const rows = await tx.department.findMany({
    where: { active: true },
    select: CHOICE,
    orderBy: { code: 'asc' },
  });
  return rows.map(({ id, ...rest }) => ({ departmentId: id, ...rest }));
}

/** Whether a department of the caller's hospital exists and is active, so it may be chosen. */
export async function isSelectableDepartment(tx: TenantTx, departmentId: string): Promise<boolean> {
  const row = await tx.department.findFirst({
    where: { id: departmentId, active: true },
    select: { id: true },
  });
  return row !== null;
}

/** Active first, then by code, the order lists and pickers show. */
export async function listDepartments(tx: TenantTx): Promise<DepartmentRecord[]> {
  const rows = await tx.department.findMany({
    select: COLUMNS,
    orderBy: [{ active: 'desc' }, { code: 'asc' }],
  });
  return rows.map(toDepartment);
}

export async function findDepartment(
  tx: TenantTx,
  departmentId: string,
): Promise<DepartmentRecord | null> {
  const row = await tx.department.findUnique({ where: { id: departmentId }, select: COLUMNS });
  return row ? toDepartment(row) : null;
}

/**
 * Whether another department of the hospital already uses the code. With one facility per
 * hospital (C-024) this is the database's (tenant, facility, code) rule, checked first so the
 * administrator gets a field error instead of a failed insert.
 */
export async function codeTaken(
  tx: TenantTx,
  code: string,
  exceptDepartmentId?: string,
): Promise<boolean> {
  const row = await tx.department.findFirst({
    where: { code, ...(exceptDepartmentId ? { id: { not: exceptDepartmentId } } : {}) },
    select: { id: true },
  });
  return row !== null;
}

export async function insertDepartment(
  tx: TenantTx,
  target: { tenantId: string; facilityId: string; userId: string },
  values: DepartmentValues,
): Promise<DepartmentRecord> {
  const row = await tx.department.create({
    data: {
      tenantId: target.tenantId,
      facilityId: target.facilityId,
      ...values,
      createdBy: target.userId,
      updatedBy: target.userId,
    },
    select: COLUMNS,
  });
  return toDepartment(row);
}

/**
 * Writes the new values only if the row is still at `expectedVersion` (SP-03). Returns the number
 * of rows changed: 0 means another edit won the race.
 */
export async function updateDepartment(
  tx: TenantTx,
  target: { departmentId: string; expectedVersion: number; userId: string; at: Date },
  values: DepartmentValues & { active: boolean },
): Promise<number> {
  const result = await tx.department.updateMany({
    where: { id: target.departmentId, version: target.expectedVersion },
    data: {
      ...values,
      updatedBy: target.userId,
      updatedAt: target.at,
      version: { increment: 1 },
    },
  });
  return result.count;
}
