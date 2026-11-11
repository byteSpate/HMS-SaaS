import { DomainError, Money } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import {
  assertDraft,
  diffDoctorFees,
  effectiveTimeFor,
  isFollowUp,
  type FeeValues,
} from './price-list.js';

// Price list rules (T-BIL-01; FR-CFG-002; C-041). IDs are synthetic.
const fee = (newPatient: string, followUp: string, days: number): FeeValues => ({
  newPatientFee: Money.parse(newPatient),
  followUpFee: Money.parse(followUp),
  followUpDays: days,
});

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'OTHER';
  }
  return 'NONE';
};

describe('price list rules', () => {
  it('changes only a draft', () => {
    expect(codeOf(() => assertDraft('DRAFT'))).toBe('NONE');
    expect(codeOf(() => assertDraft('PUBLISHED'))).toBe('INVALID_TRANSITION');
  });

  it('takes effect now, or at a time that has not passed (FR-CFG-002)', () => {
    const now = new Date('2026-11-11T06:00:00Z');
    expect(effectiveTimeFor(undefined, now)).toEqual(now);
    const tomorrow = new Date('2026-11-12T00:00:00+06:00');
    expect(effectiveTimeFor(tomorrow, now)).toEqual(tomorrow);
    // A few seconds behind, as a form submitted "now" arrives: treated as now.
    expect(effectiveTimeFor(new Date('2026-11-11T05:59:30Z'), now)).toEqual(now);
    expect(codeOf(() => effectiveTimeFor(new Date('2026-11-10T06:00:00Z'), now))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('summarises what a publication changes, doctor by doctor', () => {
    const before = new Map([
      ['p1', fee('500.00', '300.00', 14)],
      ['p2', fee('800.00', '500.00', 7)],
      ['p3', fee('600.00', '400.00', 30)],
    ]);
    const after = new Map([
      ['p1', fee('500.00', '300.00', 14)],
      ['p2', fee('900.00', '500.00', 7)],
      ['p4', fee('700.00', '350.00', 10)],
    ]);
    const changes = diffDoctorFees(before, after);
    expect(changes.map((change) => [change.practitionerId, change.change])).toEqual([
      ['p2', 'CHANGED'],
      ['p3', 'REMOVED'],
      ['p4', 'ADDED'],
    ]);
    expect(changes[0]?.after?.newPatientFee.toDecimalString()).toBe('900.00');
    expect(changes[1]?.after).toBeNull();
    expect(changes[2]?.before).toBeNull();
  });

  it('sees a changed follow-up window as a change', () => {
    const changes = diffDoctorFees(
      new Map([['p1', fee('500.00', '300.00', 14)]]),
      new Map([['p1', fee('500.00', '300.00', 21)]]),
    );
    expect(changes).toHaveLength(1);
  });
});

describe('follow-up (C-041)', () => {
  it('is a return within the window, counted in hospital dates from the last consultation', () => {
    expect(isFollowUp('2026-11-01', '2026-11-15', 14)).toBe(true);
    expect(isFollowUp('2026-11-01', '2026-11-16', 14)).toBe(false);
    expect(isFollowUp('2026-11-12', '2026-11-12', 1)).toBe(true);
  });

  it('is never the first consultation with the doctor', () => {
    expect(isFollowUp(null, '2026-11-12', 30)).toBe(false);
  });
});
