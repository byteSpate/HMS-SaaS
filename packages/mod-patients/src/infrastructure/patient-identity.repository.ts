// Reading and correcting a patient's identity (T-PAT-04; FR-PAT-008; SP-03; E section 5). Runs in the
// caller's withTenant() transaction (ADR-003). The app may update only the editable columns
// (column grants in migration 20261104120000), never the ID, the hospital or the MRN.
import type { Prisma, TenantTx } from '@hms/database';
import type {
  CurrentIdentity,
  IdentityColumns,
  IdentityField,
  PreviousValue,
} from '../domain/identity-correction.js';
import type { SealedNid } from './nid-vault.js';
import type { PatientRow } from './patient-search.repository.js';
import { dateOnly, insertIdentifier } from './patient.repository.js';

export interface StoredIdentity extends PatientRow, CurrentIdentity {
  sex: CurrentIdentity['sex'];
  reportedAgeYears: number | null;
  reportedAgeOn: string | null;
  phoneRaw: string | null;
  addressText: string | null;
  version: number;
  nid: { hash: Buffer; ciphertext: Buffer; last4: string } | null;
}

const isoDate = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

export async function loadIdentity(
  tx: TenantTx,
  tenantId: string,
  patientId: string,
): Promise<StoredIdentity | null> {
  const row = await tx.patient.findFirst({
    where: { tenantId, id: patientId },
    include: { patientIdentifiers: { where: { kind: 'NID' } } },
  });
  if (!row) return null;
  const nid = row.patientIdentifiers[0];
  return {
    id: row.id,
    mrn: row.mrn,
    identityStatus: row.identityStatus,
    nameBn: row.nameBn,
    nameEn: row.nameEn,
    sex: row.sex as CurrentIdentity['sex'],
    birthDate: isoDate(row.birthDate),
    birthDatePrecision: row.birthDatePrecision,
    birthYear: row.birthYear,
    reportedAgeYears: row.reportedAgeYears,
    reportedAgeOn: isoDate(row.reportedAgeOn),
    phoneRaw: row.phoneRaw,
    phoneNormalized: row.phoneNormalized,
    addressText: row.addressText,
    version: row.version,
    nidLast4: nid?.valueLast4 ?? null,
    nid: nid
      ? {
          hash: Buffer.from(nid.valueHash),
          ciphertext: Buffer.from(nid.valueCiphertext),
          last4: nid.valueLast4,
        }
      : null,
  };
}

/**
 * Writes the changed columns and the next version, only if the version is still the one the user
 * saw (SP-03). Returns how many rows changed: 0 means someone else corrected it first.
 */
export async function applyCorrection(
  tx: TenantTx,
  target: { tenantId: string; patientId: string; expectedVersion: number },
  columns: IdentityColumns,
): Promise<number> {
  const { birthDate, reportedAgeOn, ...rest } = columns;
  const result = await tx.patient.updateMany({
    where: { tenantId: target.tenantId, id: target.patientId, version: target.expectedVersion },
    data: {
      ...rest,
      ...(birthDate === undefined ? {} : { birthDate: dateOnly(birthDate) }),
      ...(reportedAgeOn === undefined ? {} : { reportedAgeOn: dateOnly(reportedAgeOn) }),
      version: { increment: 1 },
    },
  });
  return result.count;
}

/** A new or changed NID: replaces the sealed value of the patient's NID row, or adds one. */
export async function saveNid(
  tx: TenantTx,
  target: { tenantId: string; patientId: string; createdBy: string; exists: boolean },
  sealed: SealedNid,
): Promise<void> {
  if (!target.exists) {
    await insertIdentifier(tx, { ...target, kind: 'NID', sealed });
    return;
  }
  await tx.patientIdentifier.update({
    where: {
      tenantId_patientId_kind: {
        tenantId: target.tenantId,
        patientId: target.patientId,
        kind: 'NID',
      },
    },
    data: {
      valueCiphertext: new Uint8Array(sealed.ciphertext),
      valueHash: new Uint8Array(sealed.hash),
      valueLast4: sealed.last4,
    },
  });
}

export interface HistoryEntry {
  tenantId: string;
  patientId: string;
  version: number;
  changedFields: IdentityField[];
  previousValues: Partial<Record<IdentityField, PreviousValue>>;
  previousNidCiphertext: Buffer | null;
  reason: string;
  changedBy: string;
}

export async function insertHistory(tx: TenantTx, entry: HistoryEntry): Promise<void> {
  await tx.patientIdentityHistory.create({
    data: {
      tenantId: entry.tenantId,
      patientId: entry.patientId,
      version: entry.version,
      changedFields: entry.changedFields,
      previousValues: entry.previousValues as Prisma.InputJsonObject,
      ...(entry.previousNidCiphertext
        ? { previousNidCiphertext: new Uint8Array(entry.previousNidCiphertext) }
        : {}),
      reason: entry.reason,
      changedBy: entry.changedBy,
    },
  });
}
