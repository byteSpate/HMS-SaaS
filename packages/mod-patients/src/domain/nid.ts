// National ID numbers (T-PAT-03; FR-PAT-007, FR-PAT-011). Typed in any spelling, stored as digits.
// The requirements give no format; Bangladesh issues NIDs of 10 digits (smart card) and 13 or 17
// digits (older cards), so those are the lengths accepted (assumption in the T-PAT-03 log).
import { digitsOf } from './phone.js';

const NID_LENGTHS = new Set([10, 13, 17]);
const DIGITS = /^\d+$/;
const VISIBLE_DIGITS = 4;

/** The NID as digits, or null when the input is not one. */
export function normalizedNid(raw: string): string | null {
  const digits = digitsOf(raw);
  return DIGITS.test(digits) && NID_LENGTHS.has(digits.length) ? digits : null;
}

/** FR-PAT-007: lists and banners show only this part. */
export function visiblePartOf(nid: string): string {
  return nid.slice(-VISIBLE_DIGITS);
}
