// What every scheduling command and query needs from the request (T-SCH-01): the hospital and user
// from the session, the clock, and the hospital's time zone.
import { DomainError } from '@hms/domain-kernel';
import { getRequestContext } from '@hms/platform';

export const SCHEDULING_CLOCK = Symbol('SCHEDULING_CLOCK');

// C-024: one facility per hospital for now, and every pilot hospital is in Bangladesh. When a
// hospital can have facilities in other zones, read facility.timezone here instead.
export const HOSPITAL_TIME_ZONE = 'Asia/Dhaka';

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
