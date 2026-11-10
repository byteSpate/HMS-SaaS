import { DomainError } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { assertNotEnded, nextSessionStatus, sessionTimesOf } from './schedule-session.js';

// Schedule session rules (T-SCH-01; FR-SCH-002; AT-SCH-001; C-035). "Now" is 10:00 in Dhaka on
// 2026-11-12 (04:00 UTC).
const now = new Date('2026-11-12T04:00:00Z');
const zone = 'Asia/Dhaka';

function fieldOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'VALIDATION_FAILED') {
      const fields = error.details?.fields as { path: string }[] | undefined;
      return fields?.[0]?.path;
    }
    throw error;
  }
  return undefined;
}

describe('session times', () => {
  it('reads the start and end on the hospital clock', () => {
    expect(
      sessionTimesOf(
        { sessionDate: '2026-11-13', startTime: '17:00', endTime: '21:00' },
        now,
        zone,
      ),
    ).toEqual({
      sessionDate: '2026-11-13',
      startsAt: new Date('2026-11-13T11:00:00Z'),
      endsAt: new Date('2026-11-13T15:00:00Z'),
    });
  });

  it('rejects an end at or before the start', () => {
    const times = { sessionDate: '2026-11-13', startTime: '17:00', endTime: '17:00' };
    expect(fieldOf(() => sessionTimesOf(times, now, zone))).toBe('endTime');
  });

  it('AT-SCH-001: rejects a session that has already ended', () => {
    const yesterday = { sessionDate: '2026-11-11', startTime: '09:00', endTime: '13:00' };
    expect(fieldOf(() => sessionTimesOf(yesterday, now, zone))).toBe('sessionDate');
    const thisMorning = { sessionDate: '2026-11-12', startTime: '08:00', endTime: '10:00' };
    expect(fieldOf(() => sessionTimesOf(thisMorning, now, zone))).toBe('sessionDate');
  });

  it('accepts a session of today that is still running', () => {
    const running = { sessionDate: '2026-11-12', startTime: '09:00', endTime: '13:00' };
    expect(sessionTimesOf(running, now, zone).endsAt).toEqual(new Date('2026-11-12T07:00:00Z'));
  });

  it('AT-SCH-001: an ended session cannot be published', () => {
    expect(fieldOf(() => assertNotEnded(new Date('2026-11-12T04:00:00Z'), now))).toBe(
      'sessionDate',
    );
    expect(() => assertNotEnded(new Date('2026-11-12T04:01:00Z'), now)).not.toThrow();
  });
});

describe('session status', () => {
  const codeOf = (action: () => unknown) => {
    try {
      action();
    } catch (error) {
      return error instanceof DomainError ? error.code : 'NOT_A_DOMAIN_ERROR';
    }
    return undefined;
  };

  it('publishes a draft', () => {
    expect(nextSessionStatus('DRAFT', 'PUBLISH', 0)).toBe('PUBLISHED');
  });

  it('cancels a draft or a published session with no bookings', () => {
    expect(nextSessionStatus('DRAFT', 'CANCEL', 0)).toBe('CANCELLED');
    expect(nextSessionStatus('PUBLISHED', 'CANCEL', 0)).toBe('CANCELLED');
  });

  it('refuses the other changes as INVALID_TRANSITION', () => {
    expect(codeOf(() => nextSessionStatus('PUBLISHED', 'PUBLISH', 0))).toBe('INVALID_TRANSITION');
    expect(codeOf(() => nextSessionStatus('CANCELLED', 'PUBLISH', 0))).toBe('INVALID_TRANSITION');
    expect(codeOf(() => nextSessionStatus('CANCELLED', 'CANCEL', 0))).toBe('INVALID_TRANSITION');
  });

  it('keeps a session with bookings: its patients must be moved first', () => {
    expect(codeOf(() => nextSessionStatus('PUBLISHED', 'CANCEL', 1))).toBe('INVALID_TRANSITION');
  });
});
