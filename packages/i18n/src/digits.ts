// Digit style follows the UI language (C-036): Bangla digits in the Bangla UI, Western digits in
// English. Stored values are never changed (FR-I18N-005); this is for display only.
import type { Locale } from './locale.js';

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

export function toLocaleDigits(text: string, locale: Locale): string {
  if (locale !== 'bn-BD') return text;
  return text.replaceAll(/\d/g, (digit) => BANGLA_DIGITS.charAt(Number(digit)));
}

/** Typed input in either digit style, as Western digits for the API (an amount, a day count). */
export function toWesternDigits(text: string): string {
  return text.replaceAll(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
}
