// What every patient command and query needs from the request (T-PAT-01, T-PAT-02): the hospital
// and user from the session, and the hospital's calendar date.
import { calendarDateIn, DomainError, type Clock } from '@hms/domain-kernel';
import { getRequestContext } from '@hms/platform';

export const PATIENTS_CLOCK = Symbol('PATIENTS_CLOCK');

// C-024: one facility per hospital for now, and every pilot hospital is in Bangladesh. When a
// hospital can have facilities in other zones, read facility.timezone here instead.
const HOSPITAL_TIME_ZONE = 'Asia/Dhaka';

export interface Scope {
  tenantId: string;
  userId: string;
  membershipId?: string;
  correlationId: string;
}

export function requestScope(): Scope {
  const context = getRequestContext();
  if (!context?.tenantId || !context.userId) {
    throw new DomainError('TENANT_NOT_SELECTED', 'Choose a hospital first');
  }
  return { ...context, tenantId: context.tenantId, userId: context.userId };
}

/** The hospital's YYYY-MM-DD date at `instant`. */
export function hospitalDate(instant: Date): string {
  return calendarDateIn(instant, HOSPITAL_TIME_ZONE);
}

export function hospitalToday(clock: Clock): string {
  return hospitalDate(clock.now());
}
