// Prescribing list rows in PostgreSQL (T-CLI-03; Q-067 interim: routes, frequencies and durations
// entered by the hospital). Every function runs in the caller's withTenant() transaction (ADR-003).
import type {
  PrescribingTermChoice,
  PrescribingTermChoices,
  PrescribingTermKind,
  PrescribingTermRecord,
} from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import type { TermValues } from '../domain/catalogue.js';

const COLUMNS = {
  id: true,
  kind: true,
  labelBn: true,
  labelEn: true,
  sortOrder: true,
  active: true,
  version: true,
} as const;

const PICKER_ORDER = [{ sortOrder: 'asc' }, { labelEn: 'asc' }, { labelBn: 'asc' }] as const;

type Row = TermValues & { id: string; kind: string; active: boolean; version: number };

function toTerm({ id, kind, ...rest }: Row): PrescribingTermRecord {
  // The CHECK constraint allows only the contract's kinds.
  return { termId: id, kind: kind as PrescribingTermKind, ...rest };
}

/** By kind, then in picker order; inactive terms included. */
export async function listTerms(tx: TenantTx): Promise<PrescribingTermRecord[]> {
  const rows = await tx.prescribingTerm.findMany({
    select: COLUMNS,
    orderBy: [{ kind: 'asc' }, ...PICKER_ORDER],
  });
  return rows.map(toTerm);
}

export async function findTerm(
  tx: TenantTx,
  termId: string,
): Promise<PrescribingTermRecord | null> {
  const row = await tx.prescribingTerm.findUnique({ where: { id: termId }, select: COLUMNS });
  return row ? toTerm(row) : null;
}

export async function insertTerm(
  tx: TenantTx,
  target: { tenantId: string; userId: string },
  values: TermValues & { kind: PrescribingTermKind },
): Promise<PrescribingTermRecord> {
  const row = await tx.prescribingTerm.create({
    data: {
      tenantId: target.tenantId,
      ...values,
      createdBy: target.userId,
      updatedBy: target.userId,
    },
    select: COLUMNS,
  });
  return toTerm(row);
}

/** Writes only if the row is still at `expectedVersion` (SP-03); 0 means another edit won. */
export async function updateTerm(
  tx: TenantTx,
  target: { termId: string; expectedVersion: number; userId: string; at: Date },
  values: TermValues & { active: boolean },
): Promise<number> {
  const result = await tx.prescribingTerm.updateMany({
    where: { id: target.termId, version: target.expectedVersion },
    data: {
      ...values,
      updatedBy: target.userId,
      updatedAt: target.at,
      version: { increment: 1 },
    },
  });
  return result.count;
}

const choiceOf = (row: { id: string; labelBn: string | null; labelEn: string | null }) => ({
  termId: row.id,
  labelBn: row.labelBn,
  labelEn: row.labelEn,
});

/** The active terms of each kind, in picker order, for the prescription form. */
export async function listTermChoices(tx: TenantTx): Promise<PrescribingTermChoices> {
  const rows = await tx.prescribingTerm.findMany({
    where: { active: true },
    select: { id: true, kind: true, labelBn: true, labelEn: true },
    orderBy: [...PICKER_ORDER],
  });
  const of = (kind: PrescribingTermKind) => rows.filter((row) => row.kind === kind).map(choiceOf);
  return { routes: of('ROUTE'), frequencies: of('FREQUENCY'), durations: of('DURATION') };
}

/**
 * The active terms among the IDs, by ID, with their kind, as a prescription line keeps them
 * (T-CLI-03). An inactive or unknown ID is missing from the map.
 */
export async function findActiveTermChoices(
  tx: TenantTx,
  termIds: readonly string[],
): Promise<Map<string, PrescribingTermChoice & { kind: PrescribingTermKind }>> {
  if (termIds.length === 0) return new Map();
  const rows = await tx.prescribingTerm.findMany({
    where: { id: { in: [...new Set(termIds)] }, active: true },
    select: { id: true, kind: true, labelBn: true, labelEn: true },
  });
  return new Map(
    rows.map((row) => [row.id, { ...choiceOf(row), kind: row.kind as PrescribingTermKind }]),
  );
}
