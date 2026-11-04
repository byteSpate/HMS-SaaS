// Phone numbers for matching and search (T-PAT-01; FR-PAT-003; C-034). Equivalent spellings of one
// number become the same digits: separators go, Bangla digits become ASCII, and the +880 or 880
// country prefix becomes the leading 0.
const BANGLA_DIGIT_ZERO = 0x09e6;
const SEPARATORS = /[\s\-.()]/g;
// C-034 asks for the mobile number. Bangladesh mobile numbers are 11 digits starting 013..019.
const BANGLADESH_MOBILE = /^01[3-9]\d{8}$/;

function asciiDigits(text: string): string {
  return Array.from(text, (character) => {
    const offset = (character.codePointAt(0) ?? 0) - BANGLA_DIGIT_ZERO;
    return offset >= 0 && offset <= 9 ? String(offset) : character;
  }).join('');
}

/** The FR-PAT-003 form of any input, valid or not. */
export function normalizePhone(raw: string): string {
  const digits = asciiDigits(raw).replace(SEPARATORS, '');
  if (digits.startsWith('+880')) return `0${digits.slice(4)}`;
  if (digits.startsWith('880')) return `0${digits.slice(3)}`;
  return digits;
}

/** The normalized mobile number, or null when the input is not one. */
export function normalizedMobile(raw: string): string | null {
  const normalized = normalizePhone(raw);
  return BANGLADESH_MOBILE.test(normalized) ? normalized : null;
}
