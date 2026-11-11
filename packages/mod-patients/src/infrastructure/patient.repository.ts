// Patient rows in PostgreSQL (T-PAT-01; FR-PAT-002, FR-PAT-011; E section 5.1). Every function runs in
// the caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003).
import type { DuplicateCandidate, PatientSex } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import {
  BIRTH_YEAR_TOLERANCE,
  MAX_CANDIDATES,
  NAME_SIMILARITY_THRESHOLD,
} from '../domain/duplicate-policy.js';
import type { IdentityFacts } from '../domain/patient-identity.js';
import type { SealedNid } from './nid-vault.js';

export interface CandidateProbe {
  nameBn: string | null;
  nameEn: string | null;
  sex: PatientSex;
  birthYear: number;
  phoneNormalized: string | null;
  /** T-PAT-03: the NID lookup hash, when an NID was typed. */
  nidHash: Buffer | null;
}

interface CandidateRow {
  id: string;
  mrn: string;
  name_bn: string | null;
  name_en: string | null;
  sex: PatientSex;
  birth_year: number | null;
  birth_date_precision: DuplicateCandidate['birthDatePrecision'];
  phone_last4: string | null;
  same_phone: boolean;
  same_nid: boolean;
  similar_name: boolean;
}

function toCandidate(row: CandidateRow): DuplicateCandidate {
  const reasons: DuplicateCandidate['reasons'] = [];
  if (row.same_phone) reasons.push('SAME_PHONE');
  if (row.same_nid) reasons.push('SAME_NID');
  if (row.similar_name) reasons.push('SIMILAR_NAME');
  return {
    patientId: row.id,
    mrn: row.mrn,
    nameBn: row.name_bn,
    nameEn: row.name_en,
    sex: row.sex,
    birthYear: row.birth_year,
    birthDatePrecision: row.birth_date_precision,
    phoneLast4: row.phone_last4,
    reasons,
  };
}

/**
 * FR-PAT-011 signals: the same normalized phone, the same NID (by its lookup hash), or a similar name
 * (pg_trgm, either script) with a compatible sex and a birth year within the tolerance. UNKNOWN sex
 * is compatible with any, because missing a duplicate is worse than showing one more row. The
 * conditions are written out in the WHERE clause, so the phone, NID-hash and birth-year indexes
 * narrow the rows (RLS keeps the trigram index out, T-PAT-02 log).
 */
export async function findDuplicateCandidates(
  tx: TenantTx,
  tenantId: string,
  probe: CandidateProbe,
): Promise<DuplicateCandidate[]> {
  await tx.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(NAME_SIMILARITY_THRESHOLD)}, true)`;
  const low = probe.birthYear - BIRTH_YEAR_TOLERANCE;
  const high = probe.birthYear + BIRTH_YEAR_TOLERANCE;
  const rows = await tx.$queryRaw<CandidateRow[]>`
    SELECT id, mrn, name_bn, name_en, sex, birth_year, birth_date_precision,
           right(phone_normalized, 4) AS phone_last4,
           (phone_normalized = ${probe.phoneNormalized}::text) IS TRUE AS same_phone,
           id IN (SELECT i.patient_id FROM hms.patient_identifier i
                   WHERE i.tenant_id = ${tenantId}::uuid AND i.kind = 'NID'
                     AND i.value_hash = ${probe.nidHash}::bytea) AS same_nid,
           ((name_en OPERATOR(hms.%) ${probe.nameEn}::text OR name_bn OPERATOR(hms.%) ${probe.nameBn}::text) IS TRUE
             AND (sex = ${probe.sex} OR sex = 'UNKNOWN' OR ${probe.sex} = 'UNKNOWN')
             AND birth_year BETWEEN ${low}::int AND ${high}::int) AS similar_name
    FROM hms.patient
    WHERE tenant_id = ${tenantId}::uuid
      AND (
        phone_normalized = ${probe.phoneNormalized}::text
        OR id IN (SELECT i.patient_id FROM hms.patient_identifier i
                   WHERE i.tenant_id = ${tenantId}::uuid AND i.kind = 'NID'
                     AND i.value_hash = ${probe.nidHash}::bytea)
        OR (
          (name_en OPERATOR(hms.%) ${probe.nameEn}::text OR name_bn OPERATOR(hms.%) ${probe.nameBn}::text)
          AND (sex = ${probe.sex} OR sex = 'UNKNOWN' OR ${probe.sex} = 'UNKNOWN')
          AND birth_year BETWEEN ${low}::int AND ${high}::int
        )
      )
    ORDER BY (phone_normalized = ${probe.phoneNormalized}::text) IS TRUE DESC,
             GREATEST(hms.similarity(name_en, ${probe.nameEn}::text),
                      hms.similarity(name_bn, ${probe.nameBn}::text)) DESC NULLS LAST,
             created_at
    LIMIT ${MAX_CANDIDATES}`;
  return rows.map(toCandidate);
}

export interface NewPatient extends IdentityFacts {
  tenantId: string;
  mrn: string;
  sex: PatientSex;
  addressText: string | null;
  createdBy: string;
}

/** A DATE column takes a Date at UTC midnight of that day. */
export function dateOnly(isoDate: string | null): Date | null {
  return isoDate === null ? null : new Date(`${isoDate}T00:00:00Z`);
}

export interface InsertedPatient {
  id: string;
  mrn: string;
  version: number;
}

export function insertPatient(tx: TenantTx, patient: NewPatient): Promise<InsertedPatient> {
  return tx.patient.create({
    data: {
      tenantId: patient.tenantId,
      mrn: patient.mrn,
      nameBn: patient.nameBn,
      nameEn: patient.nameEn,
      sex: patient.sex,
      birthDate: dateOnly(patient.birthDate),
      birthDatePrecision: patient.birthDatePrecision,
      birthYear: patient.birthYear,
      reportedAgeYears: patient.reportedAgeYears,
      reportedAgeOn: dateOnly(patient.reportedAgeOn),
      phoneRaw: patient.phoneRaw,
      phoneNormalized: patient.phoneNormalized,
      addressText: patient.addressText,
      createdBy: patient.createdBy,
    },
    select: { id: true, mrn: true, version: true },
  });
}

export interface NewIdentifier {
  tenantId: string;
  patientId: string;
  kind: 'NID';
  sealed: SealedNid;
  createdBy: string;
}

/** T-PAT-03: the sealed value, its lookup hash and the visible digits; never the plain value. */
export async function insertIdentifier(tx: TenantTx, identifier: NewIdentifier): Promise<void> {
  await tx.patientIdentifier.create({
    data: {
      tenantId: identifier.tenantId,
      patientId: identifier.patientId,
      kind: identifier.kind,
      valueCiphertext: new Uint8Array(identifier.sealed.ciphertext),
      valueHash: new Uint8Array(identifier.sealed.hash),
      valueLast4: identifier.sealed.last4,
      createdBy: identifier.createdBy,
    },
  });
}

/**
 * Whether a patient of the caller's hospital exists, so an appointment may be booked for them
 * (T-SCH-02, UC-SCH-01). RLS hides other hospitals' patients. Exported from the package, so only
 * this module reads the table.
 */
export async function isBookablePatient(tx: TenantTx, patientId: string): Promise<boolean> {
  const row = await tx.patient.findFirst({ where: { id: patientId }, select: { id: true } });
  return row !== null;
}
