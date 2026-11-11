import type { Appointment, ScheduleSession } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import {
  canChange,
  canCheckIn,
  canMarkNoShow,
  hasCancelReason,
  isCapacityFull,
  placesLeft,
} from './appointment-rules';

// The appointment screens' rules (T-SCH-02; FR-SCH-002..005; C-035). IDs and names are synthetic.
const ID = (n: number) => `0199e0b0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const practitioner = {
  practitionerId: ID(801),
  nameBn: null,
  nameEn: 'Karim Uddin',
  specialty: null,
  department: null,
};
const session: ScheduleSession = {
  sessionId: ID(802),
  practitioner,
  sessionDate: '2026-11-12',
  startTime: '17:00',
  endTime: '21:00',
  startsAt: '2026-11-12T11:00:00.000Z',
  endsAt: '2026-11-12T15:00:00.000Z',
  capacity: 20,
  bookedCount: 18,
  status: 'PUBLISHED',
  version: 2,
};
const appointment: Appointment = {
  appointmentId: ID(901),
  patient: { patientId: ID(1), mrn: 'MRN-000001', nameBn: null, nameEn: 'Karim Ahmed' },
  session: {
    sessionId: session.sessionId,
    practitioner,
    sessionDate: session.sessionDate,
    startTime: session.startTime,
    endTime: session.endTime,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
  },
  status: 'BOOKED',
  rescheduledFromId: null,
  cancelReason: null,
  bookedAt: '2026-11-12T04:00:00.000Z',
  version: 1,
};
const before = new Date('2026-11-12T10:00:00Z');
const after = new Date('2026-11-12T16:00:00Z');

describe('appointment rules', () => {
  it('counts the places left in a session', () => {
    expect(placesLeft(session)).toBe(2);
    expect(placesLeft({ ...session, bookedCount: 20 })).toBe(0);
  });

  it('allows cancel and reschedule only for a booking whose session has not ended', () => {
    expect(canChange(appointment, before)).toBe(true);
    expect(canChange(appointment, after)).toBe(false);
    expect(canChange({ ...appointment, status: 'CANCELLED' }, before)).toBe(false);
  });

  it('allows a no-show only for a booking whose session has ended (FR-SCH-005)', () => {
    expect(canMarkNoShow(appointment, after)).toBe(true);
    expect(canMarkNoShow(appointment, before)).toBe(false);
    expect(canMarkNoShow({ ...appointment, status: 'CHECKED_IN' }, after)).toBe(false);
  });

  it('UC-VIS-01: checks in a booked appointment on its session date only', () => {
    expect(canCheckIn(appointment, before)).toBe(true);
    expect(canCheckIn(appointment, new Date('2026-11-13T04:00:00Z'))).toBe(false);
    expect(canCheckIn({ ...appointment, status: 'CHECKED_IN' }, before)).toBe(false);
  });

  it('needs a cancellation reason of at least three characters', () => {
    expect(hasCancelReason('  no ')).toBe(false);
    expect(hasCancelReason('Patient called')).toBe(true);
  });

  it('recognises the answer for a full session', () => {
    expect(isCapacityFull(new ApiError('CAPACITY_FULL', 409))).toBe(true);
    expect(isCapacityFull(new ApiError('STALE_RECORD', 409))).toBe(false);
    expect(isCapacityFull(null)).toBe(false);
  });
});
