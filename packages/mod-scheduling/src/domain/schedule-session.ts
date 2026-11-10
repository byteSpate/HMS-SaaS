// Schedule session rules (T-SCH-01; FR-SCH-002; AT-SCH-001; C-035). A session is one sitting of a
// practitioner on one hospital date, with a fixed capacity and no overbooking (C-035). Staff
// enter it as a draft and publish it; only a published session takes bookings (T-SCH-02).
import { DomainError, instantAt } from '@hms/domain-kernel';

export type SessionStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
export type SessionAction = 'PUBLISH' | 'CANCEL';

export interface SessionTimesInput {
  /** YYYY-MM-DD, the hospital's calendar date. */
  sessionDate: string;
  /** HH:mm on the hospital clock. */
  startTime: string;
  endTime: string;
}

export interface SessionTimes {
  sessionDate: string;
  startsAt: Date;
  endsAt: Date;
}

export function fieldError(path: string, message: string): DomainError {
  return new DomainError('VALIDATION_FAILED', 'Request body is invalid', {
    fields: [{ path, message }],
  });
}

/**
 * AT-SCH-001: a session that has ended takes no bookings, so it is refused. A session of today
 * that is still running is allowed: reception may enter a sitting that has already begun.
 */
export function assertNotEnded(endsAt: Date, now: Date): void {
  if (endsAt.getTime() <= now.getTime()) {
    throw fieldError('sessionDate', 'This session has already ended');
  }
}

/** The start and end instants of a session entered on the hospital clock in `timeZone`. */
export function sessionTimesOf(
  input: SessionTimesInput,
  now: Date,
  timeZone: string,
): SessionTimes {
  const startsAt = instantAt(input.sessionDate, input.startTime, timeZone);
  const endsAt = instantAt(input.sessionDate, input.endTime, timeZone);
  // Sessions do not run past midnight; an end at or before the start is a typing mistake.
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw fieldError('endTime', 'The session must end after it starts');
  }
  assertNotEnded(endsAt, now);
  return { sessionDate: input.sessionDate, startsAt, endsAt };
}

/**
 * DRAFT -> PUBLISHED, and DRAFT or PUBLISHED -> CANCELLED while nothing is booked. A session with
 * bookings is kept until its appointments are rescheduled or cancelled (T-SCH-02), so no patient
 * loses a booking silently.
 */
export function nextSessionStatus(
  current: SessionStatus,
  action: SessionAction,
  bookedCount: number,
): SessionStatus {
  if (action === 'PUBLISH' && current === 'DRAFT') return 'PUBLISHED';
  if (action === 'CANCEL' && current !== 'CANCELLED') {
    if (bookedCount === 0) return 'CANCELLED';
    throw new DomainError(
      'INVALID_TRANSITION',
      'This session has bookings; reschedule or cancel them first',
      { bookedCount },
    );
  }
  throw new DomainError('INVALID_TRANSITION', `A ${current} session cannot be changed that way`, {
    status: current,
  });
}
