// Identity corrections (T-PAT-04; UC-PAT-02; FR-PAT-008; C-034). Pure: given the record as it is,
// the requested changes and the hospital's date, it returns the columns to write, the fields that
// really changed and their previous values. A value equal to the current one is no change.
import type { PatientIdentityChanges, PatientSex } from '@hms/contracts';
import { normalizedNid } from './nid.js';
import { birthFactsOf, fieldError, normalizeName } from './patient-identity.js';
import { normalizedMobile } from './phone.js';

export interface CurrentIdentity {
  nameBn: string | null;
  nameEn: string | null;
  sex: PatientSex;
  birthDate: string | null;
  birthDatePrecision: string;
  reportedAgeYears: number | null;
  reportedAgeOn: string | null;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  addressText: string | null;
}

/** Birth date and age change together, as one field. The NID is decided by the caller. */
export type IdentityField = 'nameBn' | 'nameEn' | 'sex' | 'birth' | 'phone' | 'addressText' | 'nid';

export interface IdentityColumns {
  nameBn?: string | null;
  nameEn?: string | null;
  sex?: PatientSex;
  birthDate?: string | null;
  birthDatePrecision?: string;
  birthYear?: number;
  reportedAgeYears?: number | null;
  reportedAgeOn?: string | null;
  phoneRaw?: string | null;
  phoneNormalized?: string | null;
  addressText?: string | null;
}

export type PreviousValue = string | number | null | Record<string, string | number | null>;

export interface Correction {
  fields: IdentityField[];
  columns: IdentityColumns;
  previous: Partial<Record<IdentityField, PreviousValue>>;
  /** The new NID digits, when one was given; whether it differs is known only by its hash. */
  nid: string | null;
}

interface FieldChange {
  field: IdentityField;
  previous: PreviousValue;
  columns: IdentityColumns;
}

function nameChanges(current: CurrentIdentity, changes: PatientIdentityChanges): FieldChange[] {
  return (['nameBn', 'nameEn'] as const).flatMap((field) => {
    if (!(field in changes)) return [];
    const next = normalizeName(changes[field] ?? undefined);
    return next === current[field]
      ? []
      : [{ field, previous: current[field], columns: { [field]: next } }];
  });
}

function sexChange(current: CurrentIdentity, changes: PatientIdentityChanges): FieldChange | null {
  if (changes.sex === undefined || changes.sex === current.sex) return null;
  return { field: 'sex', previous: current.sex, columns: { sex: changes.sex } };
}

function birthChange(
  current: CurrentIdentity,
  changes: PatientIdentityChanges,
  today: string,
): FieldChange | null {
  if (changes.birthDate === undefined && changes.reportedAgeYears === undefined) return null;
  const birth = birthFactsOf(
    { birthDate: changes.birthDate, reportedAgeYears: changes.reportedAgeYears, phone: null },
    today,
    'changes.',
  );
  // The same age given again on another day is no correction.
  const same =
    birth.birthDatePrecision === current.birthDatePrecision &&
    birth.birthDate === current.birthDate &&
    birth.reportedAgeYears === current.reportedAgeYears;
  if (same) return null;
  const previous = {
    birthDate: current.birthDate,
    birthDatePrecision: current.birthDatePrecision,
    reportedAgeYears: current.reportedAgeYears,
    reportedAgeOn: current.reportedAgeOn,
  };
  return { field: 'birth', previous, columns: birth };
}

function phoneChange(
  current: CurrentIdentity,
  changes: PatientIdentityChanges,
): FieldChange | null {
  if (!('phone' in changes)) return null;
  const raw = changes.phone ?? null;
  const normalized = raw === null ? null : normalizedMobile(raw);
  if (raw !== null && normalized === null) {
    throw fieldError('changes.phone', 'Enter an 11-digit mobile number');
  }
  if (normalized === current.phoneNormalized) return null;
  return {
    field: 'phone',
    previous: current.phoneRaw,
    columns: { phoneRaw: raw, phoneNormalized: normalized },
  };
}

function addressChange(
  current: CurrentIdentity,
  changes: PatientIdentityChanges,
): FieldChange | null {
  if (!('addressText' in changes)) return null;
  const next = changes.addressText ?? null;
  if (next === current.addressText) return null;
  return { field: 'addressText', previous: current.addressText, columns: { addressText: next } };
}

function nidOf(changes: PatientIdentityChanges): string | null {
  if (changes.nid === undefined) return null;
  const nid = normalizedNid(changes.nid);
  if (nid === null) throw fieldError('changes.nid', 'Enter the NID: 10, 13 or 17 digits');
  return nid;
}

/** C-034 still holds after the correction: a name in at least one script. */
function assertNameRemains(current: CurrentIdentity, columns: IdentityColumns): void {
  const nameBn = 'nameBn' in columns ? columns.nameBn : current.nameBn;
  const nameEn = 'nameEn' in columns ? columns.nameEn : current.nameEn;
  if (nameBn === null && nameEn === null) {
    throw fieldError('changes.nameEn', 'A name in Bangla or English must remain');
  }
}

export function correctionOf(
  current: CurrentIdentity,
  changes: PatientIdentityChanges,
  today: string,
): Correction {
  const found = [
    ...nameChanges(current, changes),
    sexChange(current, changes),
    birthChange(current, changes, today),
    phoneChange(current, changes),
    addressChange(current, changes),
  ].filter((change): change is FieldChange => change !== null);
  const correction: Correction = {
    fields: found.map((change) => change.field),
    columns: Object.assign({}, ...found.map((change) => change.columns)) as IdentityColumns,
    previous: Object.fromEntries(found.map((change) => [change.field, change.previous])),
    nid: nidOf(changes),
  };
  assertNameRemains(current, correction.columns);
  return correction;
}
