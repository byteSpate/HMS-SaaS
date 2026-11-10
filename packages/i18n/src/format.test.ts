// Formatter behavior (T-I18N-01, FR-I18N-005, C-036, C-057, ADR-017). Strings in, strings out:
// money is never parsed as a float (ADR-007).
import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  groupLakhCrore,
  isoDateIn,
  toLocaleDigits,
} from './index.js';

describe('groupLakhCrore', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['12345', '12,345'],
    ['100000', '1,00,000'],
    ['1234567', '12,34,567'],
    ['10000000', '1,00,00,000'],
    ['123456789', '12,34,56,789'],
  ])('groups %s as %s', (input, expected) => {
    expect(groupLakhCrore(input)).toBe(expected);
  });

  it('rejects anything but digits', () => {
    expect(() => groupLakhCrore('12a')).toThrow(RangeError);
    expect(() => groupLakhCrore('')).toThrow(RangeError);
  });
});

describe('toLocaleDigits', () => {
  it('uses Bangla digits in the Bangla UI and leaves English alone', () => {
    expect(toLocaleDigits('0123456789', 'bn-BD')).toBe('০১২৩৪৫৬৭৮৯');
    expect(toLocaleDigits('0123456789', 'en')).toBe('0123456789');
  });

  it('leaves letters and punctuation untouched', () => {
    expect(toLocaleDigits('MRN-000123', 'bn-BD')).toBe('MRN-০০০১২৩');
  });
});

describe('formatMoney', () => {
  it('shows two decimals with lakh and crore grouping in English', () => {
    expect(formatMoney('1234567.5', 'en')).toBe('12,34,567.50');
    expect(formatMoney('500', 'en')).toBe('500.00');
    expect(formatMoney('10000000.00', 'en')).toBe('1,00,00,000.00');
  });

  it('uses Bangla digits and the same grouping in the Bangla UI', () => {
    expect(formatMoney('1234567.5', 'bn-BD')).toBe('১২,৩৪,৫৬৭.৫০');
  });

  it('adds the taka sign or the currency code on request', () => {
    expect(formatMoney('1000', 'en', { symbol: 'sign' })).toBe('৳ 1,000.00');
    expect(formatMoney('1000', 'en', { symbol: 'code' })).toBe('BDT 1,000.00');
    expect(formatMoney('1000', 'bn-BD', { symbol: 'sign' })).toBe('৳ ১,০০০.০০');
  });

  it('keeps the sign of a negative amount in front', () => {
    expect(formatMoney('-1500.25', 'en')).toBe('-1,500.25');
    expect(formatMoney('-1500.25', 'en', { symbol: 'sign' })).toBe('-৳ 1,500.25');
  });

  it('drops redundant leading zeros', () => {
    expect(formatMoney('007.5', 'en')).toBe('7.50');
  });

  it('refuses a value that is not an exact decimal with at most two places', () => {
    for (const bad of ['', 'abc', '1e5', '10.005', '1,000', ' 5']) {
      expect(() => formatMoney(bad, 'en')).toThrow(RangeError);
    }
  });
});

describe('formatNumber', () => {
  it('groups integers and keeps the decimals it was given', () => {
    expect(formatNumber('1234567', 'en')).toBe('12,34,567');
    expect(formatNumber('1234567.125', 'en')).toBe('12,34,567.125');
    expect(formatNumber('1234567', 'bn-BD')).toBe('১২,৩৪,৫৬৭');
  });
});

describe('dates', () => {
  // 20:30 UTC is 02:30 the next day in Dhaka (UTC+6, no daylight saving).
  const instant = '2026-11-03T20:30:00Z';

  it('formats dd-MM-yyyy in the facility time zone', () => {
    expect(formatDate(instant, 'en')).toBe('04-11-2026');
    expect(formatDate(new Date(instant), 'bn-BD')).toBe('০৪-১১-২০২৬');
  });

  it('formats date and 24-hour time', () => {
    expect(formatDateTime(instant, 'en')).toBe('04-11-2026 02:30');
    expect(formatDateTime(instant, 'bn-BD')).toBe('০৪-১১-২০২৬ ০২:৩০');
  });

  it('honors another facility time zone', () => {
    expect(formatDateTime(instant, 'en', { timeZone: 'UTC' })).toBe('03-11-2026 20:30');
  });

  it('gives the facility calendar date as YYYY-MM-DD for forms and queries (T-SCH-01)', () => {
    expect(isoDateIn(instant)).toBe('2026-11-04');
    expect(isoDateIn(instant, { timeZone: 'UTC' })).toBe('2026-11-03');
  });

  it('rejects an invalid date', () => {
    expect(() => formatDate('not a date', 'en')).toThrow(RangeError);
  });
});
