// Amounts typed into the staff app (T-BIL-01 doctor fees, T-BIL-03 cashier sessions, T-BIL-04
// payments; ADR-007). What the user typed, with Bangla or Western digits and up to two decimals,
// becomes the API's string "1500.50", never a float. The API still checks every amount.
import { toWesternDigits } from '@hms/i18n';

const AMOUNT = /^(\d{1,16})(?:\.(\d{1,2}))?$/;

/** An amount of zero or more with two decimals, or null when the text is not an amount. */
export function amountOf(text: string): string | null {
  const match = AMOUNT.exec(toWesternDigits(text.trim()));
  if (!match) return null;
  // Leading zeros are dropped as text: a 16-digit amount is beyond a JavaScript number.
  const major = (match[1] ?? '0').replace(/^0+(?=\d)/, '');
  return `${major}.${(match[2] ?? '').padEnd(2, '0')}`;
}

/** Like amountOf, but zero is not accepted (a fee, a payment). */
export function positiveAmountOf(text: string): string | null {
  const amount = amountOf(text);
  return amount === null || amount === '0.00' ? null : amount;
}
