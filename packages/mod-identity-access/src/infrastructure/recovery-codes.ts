// One-time recovery codes for a lost phone (T-ACC-04; AT-ACC-010; D section 7.1 "recovery codes
// are stored hashed"). Each code carries 50 random bits, so a plain SHA-256 is enough: there is
// no small dictionary to try, unlike passwords.
import { createHash, randomBytes } from 'node:crypto';

const CODE_COUNT = 10;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const HALF = 5;

function randomCode(): string {
  const bytes = randomBytes(HALF * 2);
  const chars = [...bytes].map((byte) => ALPHABET[byte & 31]).join('');
  return `${chars.slice(0, HALF)}-${chars.slice(HALF)}`;
}

export function newRecoveryCodes(count = CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(randomCode());
  return [...codes];
}

/** Lower case, separators ignored, so "ABCDE FGHIJ" and "abcde-fghij" are the same code. */
export function normalizeRecoveryCode(input: string): string {
  const chars = input.toLowerCase().replace(/[^a-z2-7]/g, '');
  return `${chars.slice(0, HALF)}-${chars.slice(HALF)}`;
}

export function hashRecoveryCode(input: string): Buffer {
  return createHash('sha256').update(normalizeRecoveryCode(input)).digest();
}
