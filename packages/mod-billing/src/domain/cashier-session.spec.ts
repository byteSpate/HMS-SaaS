import { DomainError, Money } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import {
  assertClosable,
  assertReviewable,
  sessionTotals,
  type MethodAmounts,
} from './cashier-session.js';

// Cashier session rules (T-BIL-03; FR-BIL-026; UC-BIL-04; AT-BIL-016, AT-BIL-017). IDs are synthetic.
const CASHIER = '0199e0a0-0000-7000-8000-00000000000a';
const FINANCE = '0199e0a0-0000-7000-8000-00000000000b';

const amounts = (values: Partial<Record<keyof MethodAmounts, string>>): MethodAmounts => ({
  CASH: Money.parse(values.CASH ?? '0.00'),
  CARD: Money.parse(values.CARD ?? '0.00'),
  MOBILE: Money.parse(values.MOBILE ?? '0.00'),
  BANK_TRANSFER: Money.parse(values.BANK_TRANSFER ?? '0.00'),
});

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'OTHER';
  }
  return 'NONE';
};

describe('cashier session rules', () => {
  it('expects the float plus cash payments in the drawer, and the payments of other methods', () => {
    const totals = sessionTotals(
      Money.parse('2000.00'),
      amounts({ CASH: '500.00', MOBILE: '300.00' }),
      null,
    );
    expect(totals.map((row) => [row.method, row.expected.toDecimalString()])).toEqual([
      ['CASH', '2500.00'],
      ['CARD', '0.00'],
      ['MOBILE', '300.00'],
      ['BANK_TRANSFER', '0.00'],
    ]);
    expect(totals.every((row) => row.counted === null && row.variance === null)).toBe(true);
  });

  it('AT-BIL-017: closing gives counted minus expected per method', () => {
    const totals = sessionTotals(
      Money.parse('2000.00'),
      amounts({ CASH: '500.00', CARD: '700.00' }),
      amounts({ CASH: '2480.00', CARD: '700.00' }),
    );
    const cash = totals.find((row) => row.method === 'CASH');
    const card = totals.find((row) => row.method === 'CARD');
    expect(cash?.variance?.toDecimalString()).toBe('-20.00');
    expect(card?.variance?.isZero()).toBe(true);
  });

  it('closes only an open session of the cashier', () => {
    expect(codeOf(() => assertClosable({ status: 'OPEN', cashierId: CASHIER }, CASHIER))).toBe(
      'NONE',
    );
    expect(
      codeOf(() =>
        assertClosable({ status: 'CLOSED_PENDING_REVIEW', cashierId: CASHIER }, CASHIER),
      ),
    ).toBe('INVALID_TRANSITION');
    expect(codeOf(() => assertClosable({ status: 'OPEN', cashierId: CASHIER }, FINANCE))).toBe(
      'PERMISSION_DENIED',
    );
  });

  it('AT-BIL-017: the cashier cannot review their own session', () => {
    const closed = { status: 'CLOSED_PENDING_REVIEW', cashierId: CASHIER, hasVariance: false };
    expect(codeOf(() => assertReviewable(closed, FINANCE, undefined))).toBe('NONE');
    expect(codeOf(() => assertReviewable(closed, CASHIER, undefined))).toBe('SEGREGATION_OF_DUTY');
    expect(codeOf(() => assertReviewable({ ...closed, status: 'OPEN' }, FINANCE, undefined))).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('needs a note to accept a variance', () => {
    const closed = { status: 'CLOSED_PENDING_REVIEW', cashierId: CASHIER, hasVariance: true };
    expect(codeOf(() => assertReviewable(closed, FINANCE, undefined))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => assertReviewable(closed, FINANCE, ''))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => assertReviewable(closed, FINANCE, 'Short 20.00, counted twice'))).toBe(
      'NONE',
    );
  });
});
