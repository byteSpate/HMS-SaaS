// Amounts typed into and added up in the staff app (T-BIL-01 doctor fees, T-BIL-03 cashier
// sessions, T-BIL-04 payments; ADR-007). What the user typed, with Bangla or Western digits and up
// to two decimals, becomes the API's string "1500.50", never a float. The API checks every amount.
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

/** "1500.25" as whole paisa, exactly. */
function paisaOf(amount: string): bigint {
  const [major = '0', minor = '00'] = amount.split('.');
  return BigInt(major) * 100n + BigInt(minor.padEnd(2, '0'));
}

/** The sum of two-decimal amounts, for what the screen shows before the server answers. */
export function sumAmounts(amounts: readonly string[]): string {
  const total = amounts.reduce((sum, amount) => sum + paisaOf(amount), 0n);
  return `${total / 100n}.${String(total % 100n).padStart(2, '0')}`;
}

/** -1, 0 or 1 as `left` is less than, equal to or more than `right`. */
export function compareAmounts(left: string, right: string): -1 | 0 | 1 {
  const difference = paisaOf(left) - paisaOf(right);
  if (difference === 0n) return 0;
  return difference < 0n ? -1 : 1;
}
