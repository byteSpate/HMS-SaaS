// The session dialog's form state and the request it sends (T-SCH-01; FR-SCH-002; C-035). Pure, so
// the rules are tested without rendering. Times are HH:mm on the hospital clock, as the inputs
// give them; the API turns them into instants.
import { MAX_SESSION_CAPACITY, type CreateScheduleSessionRequest } from '@hms/contracts';
import { isoDateIn } from '@hms/i18n';
import { ApiError } from '../../api/errors';

export type SessionForm = {
  practitionerId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  capacity: string;
};

export type SessionField = 'practitionerId' | 'sessionDate' | 'startTime' | 'endTime' | 'capacity';
const FIELDS: readonly SessionField[] = [
  'practitionerId',
  'sessionDate',
  'startTime',
  'endTime',
  'capacity',
];

export function formOf(sessionDate: string): SessionForm {
  return { practitionerId: '', sessionDate, startTime: '', endTime: '', capacity: '' };
}

/** The create request, or null while the form is incomplete or breaks a rule the API checks. */
export function requestOf(form: SessionForm): CreateScheduleSessionRequest | null {
  const capacity = Number(form.capacity);
  const complete =
    form.practitionerId !== '' &&
    form.sessionDate !== '' &&
    form.startTime !== '' &&
    form.endTime !== '';
  // HH:mm strings compare in time order.
  if (!complete || form.endTime <= form.startTime) return null;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_SESSION_CAPACITY) return null;
  return {
    practitionerId: form.practitionerId,
    sessionDate: form.sessionDate,
    startTime: form.startTime,
    endTime: form.endTime,
    capacity,
  };
}

/** The form field the API refused (an ended session, an overlap, an inactive doctor), if any. */
export function fieldWithProblem(error: unknown): SessionField | null {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') return null;
  const path = error.problem?.fields?.[0]?.path;
  return FIELDS.find((field) => field === path) ?? null;
}

/**
 * The hospital's YYYY-MM-DD date at `now` (the facility zone, Asia/Dhaka by default, C-024); a
 * browser in another zone still sees the hospital's day.
 */
export function hospitalToday(now: Date): string {
  return isoDateIn(now);
}

/** The YYYY-MM-DD date `days` after `isoDate`, on the calendar (no time zone involved). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
