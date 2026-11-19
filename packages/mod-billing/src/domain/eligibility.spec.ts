import { DomainError, Money } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { checkEligible, type GatedLine } from './eligibility.js';

const line = (overrides: Partial<GatedLine> = {}): GatedLine => ({
  lineId: 'line-1',
  invoiceNumber: 'S-000012',
  status: 'ACTIVE',
  net: Money.parse('300.00'),
  allocated: Money.parse('300.00'),
  ...overrides,
});

function refusal(run: () => void): DomainError {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('Expected a refusal');
}

describe('checkEligible (FR-BIL-003, C-040 FULL_PAYMENT)', () => {
  it('lets a fully paid line start', () => {
    expect(() => checkEligible(['line-1'], [line()])).not.toThrow();
  });

  it('refuses a partly paid line with the amount still due on its invoice', () => {
    const error = refusal(() =>
      checkEligible(['line-1'], [line({ allocated: Money.parse('100.00') })]),
    );
    expect(error.code).toBe('PAYMENT_NOT_ELIGIBLE');
    expect(error.details).toEqual({
      lines: [{ lineId: 'line-1', invoiceNumber: 'S-000012', due: '200.00' }],
    });
  });

  it('names every unpaid line when several are checked together', () => {
    const error = refusal(() =>
      checkEligible(
        ['line-1', 'line-2'],
        [
          line({ allocated: Money.parse('0.00') }),
          line({ lineId: 'line-2', net: Money.parse('500.00'), allocated: Money.parse('0.00') }),
        ],
      ),
    );
    expect(error.details).toEqual({
      lines: [
        { lineId: 'line-1', invoiceNumber: 'S-000012', due: '300.00' },
        { lineId: 'line-2', invoiceNumber: 'S-000012', due: '500.00' },
      ],
    });
  });

  it('refuses a cancelled line: there is nothing left to start', () => {
    const error = refusal(() => checkEligible(['line-1'], [line({ status: 'CANCELLED' })]));
    expect(error.code).toBe('INVALID_TRANSITION');
  });

  it('refuses a line it cannot find', () => {
    expect(refusal(() => checkEligible(['line-9'], [line()])).code).toBe('NOT_FOUND');
  });
});
