import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

// ADR-007: amounts are exact minor units; the API carries decimal strings, never JSON numbers.
describe('Money', () => {
  it('parses and prints decimal strings exactly', () => {
    expect(Money.parse('500.00').toDecimalString()).toBe('500.00');
    expect(Money.parse('500').toDecimalString()).toBe('500.00');
    expect(Money.parse('0.5').toDecimalString()).toBe('0.50');
    expect(Money.parse('-12.30').toDecimalString()).toBe('-12.30');
    expect(Money.parse('9999999999999999.99').minorUnits).toBe(999999999999999999n);
  });

  it('refuses text that is not an amount with at most two decimals', () => {
    for (const text of ['', '1.234', '1e3', ' 5', '5,00', 'NaN', '.5', '5.']) {
      expect(() => Money.parse(text)).toThrow();
    }
  });

  it('adds and subtracts without floating point', () => {
    const total = Money.parse('0.10').plus(Money.parse('0.20'));
    expect(total.toDecimalString()).toBe('0.30');
    expect(Money.parse('1000.00').minus(Money.parse('300.00')).toDecimalString()).toBe('700.00');
    expect(Money.parse('300.00').times(3).toDecimalString()).toBe('900.00');
  });

  it('compares amounts', () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.parse('0.01').isPositive()).toBe(true);
    expect(Money.parse('500').equals(Money.parse('500.00'))).toBe(true);
    expect(Money.parse('499.99').compare(Money.parse('500.00'))).toBe(-1);
  });

  it('never mixes currencies', () => {
    const usd = Money.fromMinorUnits(100n, 'USD');
    expect(() => Money.parse('1.00').plus(usd)).toThrow(/currenc/i);
  });

  it('only multiplies by whole quantities', () => {
    expect(() => Money.parse('1.00').times(1.5)).toThrow();
  });
});
