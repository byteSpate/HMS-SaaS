// Patient search in PostgreSQL (T-PAT-02; FR-PAT-003, FR-I18N-003; E section 7: GIN trigram on both
// name columns, btree on phone and MRN). Runs in the caller's withTenant() transaction (ADR-003).
import type { TenantTx } from '@hms/database';
import {
  MAX_SEARCH_RESULTS,
  NAME_SEARCH_SIMILARITY,
  type SearchTerm,
} from '../domain/search-term.js';

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
}

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

type StoredRow = Omit<PatientRow, 'birthDate'> & { birthDate: Date | null };

function toRow(stored: StoredRow): PatientRow {
  return { ...stored, birthDate: stored.birthDate?.toISOString().slice(0, 10) ?? null };
}

/** ILIKE treats % and _ as wildcards; a typed name must match them literally. */
function containsPattern(name: string): string {
  const literal = name.replace(/[\\%_]/g, (character) => '\\' + character);
  return `%${literal}%`;
}

/**
 * Names in either script: a contains match finds short or partial names, and trigram similarity
 * finds misspellings. The closest names come first. Under RLS PostgreSQL cannot use the GIN
 * trigram indexes for these operators, because they are not leakproof, so this scans the hospital's
 * patients: about 3 to 7 s at 600,000 (T-PAT-02 log). The fix is an open decision.
 */
async function byName(tx: TenantTx, tenantId: string, name: string): Promise<PatientRow[]> {
  await tx.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(NAME_SEARCH_SIMILARITY)}, true)`;
  const like = containsPattern(name);
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
  >`
    SELECT id, mrn, identity_status, name_bn, name_en, sex, birth_date, birth_date_precision,
           birth_year, phone_normalized
    FROM hms.patient
    WHERE tenant_id = ${tenantId}::uuid
      AND (name_en ILIKE ${like} OR name_bn ILIKE ${like}
           OR name_en OPERATOR(hms.%) ${name} OR name_bn OPERATOR(hms.%) ${name})
    ORDER BY GREATEST(hms.similarity(name_en, ${name}), hms.similarity(name_bn, ${name})) DESC NULLS LAST,
             created_at DESC
    LIMIT ${MAX_SEARCH_RESULTS}`;
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
  term: SearchTerm,
): Promise<PatientRow[]> {
  if (term.kind === 'NAME') return byName(tx, tenantId, term.name);
  const rows = await tx.patient.findMany({
    where: whereOf(tenantId, term),
    select: COLUMNS,
    orderBy: { createdAt: 'desc' },
    take: MAX_SEARCH_RESULTS,
  });
  return rows.map(toRow);
}

/** Exact MRN and phone use their btree indexes; the MRN number part needs a suffix match. */
function whereOf(tenantId: string, term: Exclude<SearchTerm, { kind: 'NAME' }>) {
  switch (term.kind) {
    case 'MRN':
      return { tenantId, mrn: term.mrn };
    case 'PHONE':
      return { tenantId, phoneNormalized: term.phone };
    case 'MRN_NUMBER':
      return { tenantId, mrn: { endsWith: term.mrnSuffix } };
  }
}
