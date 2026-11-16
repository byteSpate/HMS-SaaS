import { DomainError } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { assertCanStart, byQueueOrder, worklistStatusOf, type StartFacts } from './worklist.js';

// The doctor worklist's rules (T-CLI-01; FR-CLI-002; UC-CLI-01; C-009, C-011; SP-03).

const codeOf = (action: () => void): string | undefined => {
  try {
    action();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'not a DomainError';
  }
  return undefined;
};

describe('worklistStatusOf', () => {
  it('a booked appointment without a visit is EXPECTED', () => {
    expect(worklistStatusOf({ checkedIn: false, consultation: null, doctorFee: 'NONE' })).toBe(
      'EXPECTED',
    );
  });

  it('FR-CLI-002: checked in with the fee unpaid is WAITING_PAYMENT, paid is WAITING', () => {
    const facts = { checkedIn: true, consultation: null } as const;
    expect(worklistStatusOf({ ...facts, doctorFee: 'NOT_ELIGIBLE' })).toBe('WAITING_PAYMENT');
    expect(worklistStatusOf({ ...facts, doctorFee: 'ELIGIBLE' })).toBe('WAITING');
  });

  it('UC-VIS-01 A1: with no doctor fee configured there is nothing to pay, so WAITING', () => {
    expect(worklistStatusOf({ checkedIn: true, consultation: null, doctorFee: 'NONE' })).toBe(
      'WAITING',
    );
  });

  it('a started or signed consultation is shown as such, whatever the fee', () => {
    expect(
      worklistStatusOf({ checkedIn: true, consultation: 'IN_CONSULTATION', doctorFee: 'ELIGIBLE' }),
    ).toBe('IN_CONSULTATION');
    expect(
      worklistStatusOf({ checkedIn: true, consultation: 'CONSULTED', doctorFee: 'ELIGIBLE' }),
    ).toBe('CONSULTED');
  });
});

describe('byQueueOrder', () => {
  it('checked-in patients by serial number first, then the expected ones by booking time', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 16, 4, minute));
    const entries = [
      { id: 'expected-late', queueNumber: null, bookedAt: at(30) },
      { id: 'second', queueNumber: 2, bookedAt: at(1) },
      { id: 'expected-early', queueNumber: null, bookedAt: at(10) },
      { id: 'first', queueNumber: 1, bookedAt: at(20) },
    ];
    expect([...entries].sort(byQueueOrder).map((entry) => entry.id)).toEqual([
      'first',
      'second',
      'expected-early',
      'expected-late',
    ]);
  });
});

describe('assertCanStart', () => {
  const ready: StartFacts = {
    visit: {
      kind: 'OPD_CONSULTATION',
      status: 'OPEN',
      attendingPractitionerId: 'dr-karim',
      version: 1,
    },
    doctorPractitionerId: 'dr-karim',
    expectedVersion: 1,
    consultationExists: false,
    doctorFee: 'ELIGIBLE',
  };

  it('lets the visit doctor start an eligible, open consultation visit', () => {
    expect(codeOf(() => assertCanStart(ready))).toBeUndefined();
    expect(codeOf(() => assertCanStart({ ...ready, doctorFee: 'NONE' }))).toBeUndefined();
  });

  it('UC-CLI-01 D1: an unpaid doctor fee is PAYMENT_NOT_ELIGIBLE (C-011)', () => {
    expect(codeOf(() => assertCanStart({ ...ready, doctorFee: 'NOT_ELIGIBLE' }))).toBe(
      'PAYMENT_NOT_ELIGIBLE',
    );
  });

  it("only the visit's doctor: another or an unlinked account is PERMISSION_DENIED", () => {
    expect(codeOf(() => assertCanStart({ ...ready, doctorPractitionerId: 'dr-other' }))).toBe(
      'PERMISSION_DENIED',
    );
    expect(codeOf(() => assertCanStart({ ...ready, doctorPractitionerId: null }))).toBe(
      'PERMISSION_DENIED',
    );
  });

  it('SP-03: a version the worklist did not show is STALE_RECORD', () => {
    expect(codeOf(() => assertCanStart({ ...ready, expectedVersion: 2 }))).toBe('STALE_RECORD');
  });

  it('a started consultation, or a visit that is not an open consultation, cannot start', () => {
    expect(codeOf(() => assertCanStart({ ...ready, consultationExists: true }))).toBe(
      'INVALID_TRANSITION',
    );
    expect(
      codeOf(() => assertCanStart({ ...ready, visit: { ...ready.visit, status: 'CANCELLED' } })),
    ).toBe('INVALID_TRANSITION');
    expect(
      codeOf(() => assertCanStart({ ...ready, visit: { ...ready.visit, kind: 'DIAGNOSTIC' } })),
    ).toBe('INVALID_TRANSITION');
  });
});
