// Cashier session rules (T-BIL-03; FR-BIL-026; UC-BIL-04; SRC-B07). Pure: what each payment method
// should hold, the variance at closing, and who may close and review a session. Amounts are Money
// throughout (ADR-007).
import { DomainError, fieldError, Money } from '@hms/domain-kernel';

export const SESSION_METHODS = ['CASH', 'CARD', 'MOBILE', 'BANK_TRANSFER'] as const;
export type SessionMethod = (typeof SESSION_METHODS)[number];
export type MethodAmounts = Record<SessionMethod, Money>;

export interface SessionTotal {
  method: SessionMethod;
  expected: Money;
  counted: Money | null;
  variance: Money | null;
}

export function zeroAmounts(): MethodAmounts {
  return {
    CASH: Money.zero(),
    CARD: Money.zero(),
    MOBILE: Money.zero(),
    BANK_TRANSFER: Money.zero(),
  };
}

/**
 * FR-BIL-026: the expected amount of each method is the sum of the session's payments in it; the
 * drawer also holds the opening float, so it is part of the expected cash. With the counted
 * amounts (at closing) each row gets its variance, counted - expected: negative means missing.
 */
export function sessionTotals(
  openingFloat: Money,
  payments: MethodAmounts,
  counted: MethodAmounts | null,
): SessionTotal[] {
  return SESSION_METHODS.map((method) => {
    const expected = method === 'CASH' ? payments.CASH.plus(openingFloat) : payments[method];
    const count = counted ? counted[method] : null;
    return {
      method,
      expected,
      counted: count,
      variance: count ? count.minus(expected) : null,
    };
  });
}

export function hasVariance(totals: readonly SessionTotal[]): boolean {
  return totals.some((row) => row.variance !== null && !row.variance.isZero());
}

/** Only the session's own cashier closes it, and only while it is open. */
export function assertClosable(
  session: { status: string; cashierId: string },
  userId: string,
): void {
  if (session.cashierId !== userId) {
    throw new DomainError('PERMISSION_DENIED', 'Only the cashier of this session can close it');
  }
  if (session.status !== 'OPEN') {
    throw new DomainError('INVALID_TRANSITION', 'This cashier session is already closed', {
      status: session.status,
    });
  }
}

/**
 * UC-BIL-04 step 5 and D2: a finance user other than the cashier reviews a closed session. A
 * variance is accepted only with a note saying why.
 */
export function assertReviewable(
  session: { status: string; cashierId: string; hasVariance: boolean },
  reviewerId: string,
  note: string | undefined,
): void {
  if (session.status !== 'CLOSED_PENDING_REVIEW') {
    throw new DomainError('INVALID_TRANSITION', 'Only a closed session waiting for review', {
      status: session.status,
    });
  }
  if (session.cashierId === reviewerId) {
    throw new DomainError('SEGREGATION_OF_DUTY', 'A cashier cannot review their own session');
  }
  if (session.hasVariance && !note?.trim()) {
    throw fieldError('note', 'Say why the variance is accepted');
  }
}
