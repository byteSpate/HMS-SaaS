// Appointment rules (T-SCH-02; FR-SCH-001..005; UC-SCH-01/02; C-035). A booking holds one place in a
// published session until it is cancelled, rescheduled, checked in (T-VIS-01) or marked a no-show.
// A booking is not attendance: no visit or invoice exists until check-in (FR-SCH-001, C-007).
import { DomainError } from '@hms/domain-kernel';
import { fieldError, type SessionStatus } from './schedule-session.js';

export type AppointmentStatus = 'BOOKED' | 'CHECKED_IN' | 'RESCHEDULED' | 'CANCELLED' | 'NO_SHOW';
export type AppointmentAction = 'CANCEL' | 'RESCHEDULE' | 'NO_SHOW';

/** UC-SCH-01: only a published session that has not ended takes bookings (D2). */
export function assertBookable(session: { status: SessionStatus; endsAt: Date }, now: Date): void {
  if (session.status !== 'PUBLISHED') {
    throw fieldError('sessionId', 'This session is not open for booking');
  }
  if (session.endsAt.getTime() <= now.getTime()) {
    throw fieldError('sessionId', 'This session has already ended');
  }
}

export const appointmentNotFound = () => new DomainError('NOT_FOUND', 'Appointment not found');
export const staleAppointment = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this appointment; reload it', {
    currentVersion,
  });

const refused = (message: string, details: Record<string, unknown>) =>
  new DomainError('INVALID_TRANSITION', message, details);

/**
 * Only a BOOKED appointment changes. Before its session ends it can be cancelled or rescheduled;
 * after the end it can only be marked a no-show (FR-SCH-005), so the record says what happened.
 * A checked-in appointment belongs to its visit (UC-SCH-02 D1).
 */
export function nextAppointmentStatus(
  current: AppointmentStatus,
  action: AppointmentAction,
  sessionEndsAt: Date,
  now: Date,
): AppointmentStatus {
  if (current !== 'BOOKED') {
    throw refused(`A ${current} appointment cannot be changed`, { status: current });
  }
  const ended = sessionEndsAt.getTime() <= now.getTime();
  if (action === 'NO_SHOW') {
    if (!ended) throw refused('The session has not ended yet', { action });
    return 'NO_SHOW';
  }
  if (ended) throw refused('The session has ended; mark the appointment as a no-show', { action });
  return action === 'CANCEL' ? 'CANCELLED' : 'RESCHEDULED';
}

/**
 * UC-VIS-01: a BOOKED appointment is checked in on its session's hospital date (D1: a cancelled
 * or no-show appointment is refused). Early or late tolerance is a proposed policy, not built:
 * the patient arrives on the day of the sitting.
 */
export function assertCheckIn(
  current: AppointmentStatus,
  sessionDate: string,
  hospitalToday: string,
): void {
  if (current !== 'BOOKED') {
    throw refused(`A ${current} appointment cannot be checked in`, { status: current });
  }
  if (sessionDate !== hospitalToday) {
    throw refused('Check in on the day of the session', { sessionDate });
  }
}
