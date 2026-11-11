// What the appointment screens offer (T-SCH-02; FR-SCH-002..005; C-035). Pure, so the rules are
// tested without rendering. They mirror the API's rules, which still decide every request.
import type { Appointment, ScheduleSession } from '@hms/contracts';
import { ApiError } from '../../api/errors';
import { hospitalToday } from '../schedules/session-form';

/** C-035: a session never takes more than its capacity. */
export function placesLeft(session: ScheduleSession): number {
  return Math.max(0, session.capacity - session.bookedCount);
}

const ended = (appointment: Appointment, now: Date) =>
  new Date(appointment.session.endsAt).getTime() <= now.getTime();

/** Cancel or reschedule: a booking whose session has not ended. */
export function canChange(appointment: Appointment, now: Date): boolean {
  return appointment.status === 'BOOKED' && !ended(appointment, now);
}

/** FR-SCH-005: a booking whose session has ended. */
export function canMarkNoShow(appointment: Appointment, now: Date): boolean {
  return appointment.status === 'BOOKED' && ended(appointment, now);
}

/** UC-VIS-01: a booked appointment is checked in on its session's hospital date (T-VIS-01). */
export function canCheckIn(appointment: Appointment, now: Date): boolean {
  return appointment.status === 'BOOKED' && appointment.session.sessionDate === hospitalToday(now);
}

/** The same minimum as the contract: three characters after trimming. */
export function hasCancelReason(reason: string): boolean {
  return reason.trim().length >= 3;
}

/** The API refused a booking because the last place was taken. */
export function isCapacityFull(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'CAPACITY_FULL';
}
