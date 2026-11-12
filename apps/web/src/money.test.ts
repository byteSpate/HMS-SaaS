import { toLocaleDigits } from '@hms/i18n';
import { describe, expect, it } from 'vitest';
import { amountOf, compareAmounts, positiveAmountOf, sumAmounts } from './money';

// Typed amounts (T-BIL-03, T-BIL-04; ADR-007).
describe('typed amounts', () => {
  it('reads either digit style with up to two decimals', () => {
    expect(amountOf('1500')).toBe('1500.00');
    expect(amountOf(' 1500.5 ')).toBe('1500.50');
    expect(amountOf(toLocaleDigits('1500.25', 'bn-BD'))).toBe('1500.25');
    expect(amountOf('007')).toBe('7.00');
    expect(amountOf('9999999999999999.99')).toBe('9999999999999999.99');
  });

  it('refuses what is not an amount', () => {
    expect(amountOf('1,500')).toBeNull();
    expect(amountOf('-5')).toBeNull();
    expect(amountOf('12.345')).toBeNull();
    expect(amountOf('')).toBeNull();
  });

  it('takes zero as an amount, but not as a positive amount', () => {
    expect(amountOf('0')).toBe('0.00');
    expect(positiveAmountOf('0.00')).toBeNull();
    expect(positiveAmountOf('000')).toBeNull();
    expect(positiveAmountOf('0.01')).toBe('0.01');
  });

  it('adds and compares amounts exactly, never as floats', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
    expect(sumAmounts(['500.00', '300.00', '0.05'])).toBe('800.05');
    expect(sumAmounts([])).toBe('0.00');
    expect(compareAmounts('700.00', '700.00')).toBe(0);
    expect(compareAmounts('700.01', '700.00')).toBe(1);
    expect(compareAmounts('99.99', '100.00')).toBe(-1);
  });
});
