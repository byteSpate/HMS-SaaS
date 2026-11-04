// Patient search in PostgreSQL (T-PAT-02; FR-PAT-003, FR-I18N-003). Phone and MRN use btree indexes;
// names use hms.search_patients_by_name. Runs in the caller's withTenant() transaction (ADR-003).
import type { TenantTx } from '@hms/database';
import { MAX_SEARCH_RESULTS, type SearchTerm } from '../domain/search-term.js';

export interface PatientRow {
  id: string;
  mrn: string;
  identityStatus: string;
  nameBn: string | null;
  nameEn: string | null;
  sex: string;
  birthDate: string | null;
  birthDatePrecision: string;
  birthYear: number | null;
  phoneNormalized: string | null;
  /** FR-PAT-007: the visible part of the NID, or null when none is recorded. */
  nidLast4: string | null;
}

/** A search term, with an NID already turned into its lookup hash by the vault. */
export type PatientQuery =
  Exclude<SearchTerm, { kind: 'NID' }> | { kind: 'NID_HASH'; hash: Buffer };

const COLUMNS = {
  id: true,
  mrn: true,
  identityStatus: true,
  nameBn: true,
  nameEn: true,
  sex: true,
  birthDate: true,
  birthDatePrecision: true,
  birthYear: true,
  phoneNormalized: true,
} as const;

type StoredRow = Omit<PatientRow, 'birthDate' | 'nidLast4'> & { birthDate: Date | null };

function toRow(stored: StoredRow): PatientRow {
  return {
    ...stored,
    birthDate: stored.birthDate?.toISOString().slice(0, 10) ?? null,
    nidLast4: null,
  };
}

/**
 * Names go through hms.search_patients_by_name (migration 20261104100000): under RLS PostgreSQL
 * cannot use the trigram index for pg_trgm's operators, so the function runs the indexed,
 * nearest-first search itself and filters on the session's hospital (owner decision 2026-11-04).
 */
async function byName(tx: TenantTx, name: string): Promise<PatientRow[]> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      mrn: string;
      identity_status: string;
      name_bn: string | null;
      name_en: string | null;
      sex: string;
      birth_date: Date | null;
      birth_date_precision: string;
      birth_year: number | null;
      phone_normalized: string | null;
    }[]
  >`SELECT * FROM hms.search_patients_by_name(${name})`;
  return rows.map((row) =>
    toRow({
      id: row.id,
      mrn: row.mrn,
      identityStatus: row.identity_status,
      nameBn: row.name_bn,
      nameEn: row.name_en,
      sex: row.sex,
      birthDate: row.birth_date,
      birthDatePrecision: row.birth_date_precision,
      birthYear: row.birth_year,
      phoneNormalized: row.phone_normalized,
    }),
  );
}

export async function findPatients(
  tx: TenantTx,
  tenantId: string,
  query: PatientQuery,
): Promise<PatientRow[]> {
  const rows =
    query.kind === 'NAME'
      ? await byName(tx, query.name)
      : (
          await tx.patient.findMany({
            where: whereOf(tenantId, query),
            select: COLUMNS,
            orderBy: { createdAt: 'desc' },
            take: MAX_SEARCH_RESULTS,
          })
        ).map(toRow);
  return withVisibleNids(tx, tenantId, rows);
}

/** One indexed lookup for the visible NID digits of the rows found. */
async function withVisibleNids(
  tx: TenantTx,
  tenantId: string,
  rows: PatientRow[],
): Promise<PatientRow[]> {
  if (rows.length === 0) return rows;
  const visible = await tx.patientIdentifier.findMany({
    where: { tenantId, kind: 'NID', patientId: { in: rows.map((row) => row.id) } },
    select: { patientId: true, valueLast4: true },
  });
  const last4 = new Map(visible.map((entry) => [entry.patientId, entry.valueLast4]));
  return rows.map((row) => ({ ...row, nidLast4: last4.get(row.id) ?? null }));
}

/**
 * Exact MRN, phone and NID hash use their btree indexes; the MRN number part needs a suffix match.
 */
function whereOf(tenantId: string, query: Exclude<PatientQuery, { kind: 'NAME' }>) {
  switch (query.kind) {
    case 'MRN':
      return { tenantId, mrn: query.mrn };
    case 'PHONE':
      return { tenantId, phoneNormalized: query.phone };
    case 'NID_HASH':
      return {
        tenantId,
        patientIdentifiers: { some: { kind: 'NID', valueHash: new Uint8Array(query.hash) } },
      };
    case 'MRN_NUMBER':
      return { tenantId, mrn: { endsWith: query.mrnSuffix } };
  }
}
