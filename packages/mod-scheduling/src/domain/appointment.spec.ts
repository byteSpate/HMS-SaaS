import { DomainError } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { assertBookable, nextAppointmentStatus } from './appointment.js';

// Appointment rules (T-SCH-02; FR-SCH-001..005; UC-SCH-01/02; AT-SCH-004..006). "Now" is 10:00 in
// Dhaka on 2026-11-12 (04:00 UTC).
const now = new Date('2026-11-12T04:00:00Z');
const later = new Date('2026-11-12T15:00:00Z');
const earlier = new Date('2026-11-12T03:00:00Z');

function failureOf(action: () => unknown): { code: string; path?: string } | undefined {
  try {
    action();
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const fields = error.details?.fields as { path: string }[] | undefined;
    return { code: error.code, ...(fields?.[0] ? { path: fields[0].path } : {}) };
  }
  return undefined;
}

describe('booking a session', () => {
  it('books a published session that has not ended', () => {
    expect(() => assertBookable({ status: 'PUBLISHED', endsAt: later }, now)).not.toThrow();
  });

  it('refuses a draft or cancelled session on sessionId', () => {
    expect(failureOf(() => assertBookable({ status: 'DRAFT', endsAt: later }, now))).toEqual({
      code: 'VALIDATION_FAILED',
      path: 'sessionId',
    });
    expect(failureOf(() => assertBookable({ status: 'CANCELLED', endsAt: later }, now))).toEqual({
      code: 'VALIDATION_FAILED',
      path: 'sessionId',
    });
  });

  it('UC-SCH-01 D2: refuses a session that has ended', () => {
    expect(failureOf(() => assertBookable({ status: 'PUBLISHED', endsAt: earlier }, now))).toEqual({
      code: 'VALIDATION_FAILED',
      path: 'sessionId',
    });
  });
});

describe('appointment status', () => {
  it('AT-SCH-004/005: reschedules or cancels a booking before its session ends', () => {
    expect(nextAppointmentStatus('BOOKED', 'RESCHEDULE', later, now)).toBe('RESCHEDULED');
    expect(nextAppointmentStatus('BOOKED', 'CANCEL', later, now)).toBe('CANCELLED');
  });

  it('a booking whose session has ended is a no-show, not a cancellation', () => {
    expect(failureOf(() => nextAppointmentStatus('BOOKED', 'CANCEL', earlier, now))?.code).toBe(
      'INVALID_TRANSITION',
    );
    expect(failureOf(() => nextAppointmentStatus('BOOKED', 'RESCHEDULE', earlier, now))?.code).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('AT-SCH-006: marks a no-show only after the session ends', () => {
    expect(nextAppointmentStatus('BOOKED', 'NO_SHOW', earlier, now)).toBe('NO_SHOW');
    expect(failureOf(() => nextAppointmentStatus('BOOKED', 'NO_SHOW', later, now))?.code).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('UC-SCH-02 D1: changes nothing once checked in, rescheduled, cancelled or a no-show', () => {
    for (const status of ['CHECKED_IN', 'RESCHEDULED', 'CANCELLED', 'NO_SHOW'] as const) {
      for (const action of ['CANCEL', 'RESCHEDULE', 'NO_SHOW'] as const) {
        expect(failureOf(() => nextAppointmentStatus(status, action, earlier, now))?.code).toBe(
          'INVALID_TRANSITION',
        );
      }
    }
  });
});
