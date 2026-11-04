// How a search term is read (T-PAT-02; UC-PAT-01 step 1; FR-PAT-003, FR-I18N-003). One box takes an
// MRN, a mobile number in any spelling, the number part of an MRN, or a name in either script.
import { DomainError } from '@hms/domain-kernel';
import { normalizeName } from './patient-identity.js';
import { normalizedMobile, normalizePhone } from './phone.js';

// C-033: {PREFIX}-{seq:6}, the prefix being 2 to 8 capitals or digits (numbering policy).
const MRN = /^[A-Z0-9]{2,8}-\d+$/;
const DIGITS = /^\d+$/;
const MRN_SEQUENCE_WIDTH = 6;
/**
 * A trigram index needs three characters, and two letters match tens of thousands of names
 * (T-PAT-02 volume check). The similarity threshold of name search lives in
 * hms.search_patients_by_name.
 */
export const MIN_NAME_LENGTH = 3;
/** UC-PAT-01: up to 20 ranked matches. */
export const MAX_SEARCH_RESULTS = 20;

export type SearchTerm =
  | { kind: 'MRN'; mrn: string }
  | { kind: 'PHONE'; phone: string }
  /** Digits that are not a mobile number: the number part of an MRN, e.g. "123" for SMH-000123. */
  | { kind: 'MRN_NUMBER'; mrnSuffix: string }
  | { kind: 'NAME'; name: string };

export function searchTermOf(raw: string): SearchTerm {
  // A mobile number first: "01700-000001" also has the shape of an MRN with a digit prefix, but a
  // real MRN such as SMH-000123 is never a valid mobile number, so nothing is lost.
  const mobile = normalizedMobile(raw);
  if (mobile !== null) return { kind: 'PHONE', phone: mobile };

  const tidy = normalizeName(raw) ?? '';
  const upper = tidy.toUpperCase();
  if (MRN.test(upper)) return { kind: 'MRN', mrn: upper };

  const digits = normalizePhone(raw);
  if (DIGITS.test(digits)) {
    return { kind: 'MRN_NUMBER', mrnSuffix: `-${digits.padStart(MRN_SEQUENCE_WIDTH, '0')}` };
  }

  if (Array.from(tidy).length < MIN_NAME_LENGTH) {
    throw new DomainError('VALIDATION_FAILED', 'Request body is invalid', {
      fields: [{ path: 'term', message: 'Type at least three letters, a phone number or an MRN' }],
    });
  }
  return { kind: 'NAME', name: tidy };
}
