// Practitioner rows in PostgreSQL (T-PRA-01; E section 5.1). Every function runs in the caller's
// withTenant() transaction, so RLS limits it to one hospital (ADR-003).
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
  active: true,
  version: true,
} as const;

type Row = PractitionerValues & { id: string; active: boolean; version: number };

function toPractitioner({ id, ...rest }: Row): Practitioner {
  return { practitionerId: id, ...rest };
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
