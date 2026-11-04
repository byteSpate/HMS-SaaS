// Identity facts of a new patient (T-PAT-01; FR-PAT-005, -006, -009; C-034). Pure rules: the caller
// gives the hospital's date, and gets either the facts to store or a field error.
import type { PatientIdentityInput } from '@hms/contracts';
import { DomainError, yearOf } from '@hms/domain-kernel';
import { normalizedNid } from './nid.js';
import { normalizedMobile } from './phone.js';

const OLDEST_AGE_YEARS = 150;

/** Sex is stored as given, so these rules do not need it. */
export type IdentityInput = Omit<PatientIdentityInput, 'sex'>;

export interface BirthFacts {
  birthDate: string | null;
  birthDatePrecision: 'EXACT' | 'YEAR_ESTIMATED';
  birthYear: number;
  reportedAgeYears: number | null;
  reportedAgeOn: string | null;
}

export interface IdentityFacts extends BirthFacts {
  nameBn: string | null;
  nameEn: string | null;
  phoneRaw: string | null;
  phoneNormalized: string | null;
  /** T-PAT-03: digits only; the API seals it before it reaches the database. */
  nid: string | null;
}

function fieldError(path: string, message: string): DomainError {
  return new DomainError('VALIDATION_FAILED', 'Request body is invalid', {
    fields: [{ path, message }],
  });
}

/** FR-PAT-009: stored as entered, in NFC, with spaces tidied, so equal names compare equal. */
export function normalizeName(name: string | undefined): string | null {
  if (name === undefined) return null;
  const tidy = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  return tidy.length > 0 ? tidy : null;
}

/** FR-PAT-006: an exact date when known; otherwise the reported age, its day and an estimated year. */
export function birthFactsOf(input: IdentityInput, today: string): BirthFacts {
  if (input.birthDate !== undefined) {
    if (input.birthDate > today) throw fieldError('birthDate', 'The birth date is in the future');
    if (yearOf(today) - yearOf(input.birthDate) > OLDEST_AGE_YEARS) {
      throw fieldError('birthDate', 'The birth date is too far in the past');
    }
    return {
      birthDate: input.birthDate,
      birthDatePrecision: 'EXACT',
      birthYear: yearOf(input.birthDate),
      reportedAgeYears: null,
      reportedAgeOn: null,
    };
  }
  if (input.reportedAgeYears === undefined)
    throw fieldError('birthDate', 'Enter the birth date or the age');
  return {
    birthDate: null,
    birthDatePrecision: 'YEAR_ESTIMATED',
    birthYear: yearOf(today) - input.reportedAgeYears,
    reportedAgeYears: input.reportedAgeYears,
    reportedAgeOn: today,
  };
}

export function identityFactsOf(input: IdentityInput, today: string): IdentityFacts {
  const nameBn = normalizeName(input.nameBn);
  const nameEn = normalizeName(input.nameEn);
  if (nameBn === null && nameEn === null) {
    throw fieldError('nameEn', 'Enter the name in Bangla or English');
  }
  let phoneNormalized: string | null = null;
  if (input.phone !== null) {
    phoneNormalized = normalizedMobile(input.phone);
    if (phoneNormalized === null) throw fieldError('phone', 'Enter an 11-digit mobile number');
  }
  let nid: string | null = null;
  if (input.nid !== undefined) {
    nid = normalizedNid(input.nid);
    if (nid === null) throw fieldError('nid', 'Enter the NID: 10, 13 or 17 digits');
  }
  return {
    nameBn,
    nameEn,
    phoneRaw: input.phone,
    phoneNormalized,
    nid,
    ...birthFactsOf(input, today),
  };
}
