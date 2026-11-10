// Schedule session endpoints (T-SCH-01; FR-SCH-002). Every answer is checked against the shared
// contract. Commands carry an Idempotency-Key made once per dialog or action, so a retry after a
// timeout returns the same session instead of a second one (SP-08).
import {
  practitionerChoiceListSchema,
  scheduleSessionListSchema,
  scheduleSessionSchema,
  type CreateScheduleSessionRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export const SCHEDULE_SESSIONS_QUERY_KEY = ['schedule-sessions'] as const;
export const SCHEDULE_PRACTITIONERS_QUERY_KEY = [
  ...SCHEDULE_SESSIONS_QUERY_KEY,
  'practitioner-choices',
] as const;

export const scheduleSessionsApi = {
  list: (from: string, to: string) =>
    apiRequest(`/schedule-sessions?${new URLSearchParams({ from, to }).toString()}`, {
      parse: (data) => scheduleSessionListSchema.parse(data).sessions,
    }),
  practitionerChoices: () =>
    apiRequest('/schedule-sessions/practitioner-choices', {
      parse: (data) => practitionerChoiceListSchema.parse(data).practitioners,
    }),
  create: (body: CreateScheduleSessionRequest, key: string) =>
    apiRequest('/schedule-sessions', {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => scheduleSessionSchema.parse(data),
    }),
  change: (sessionId: string, action: 'publish' | 'cancel', expectedVersion: number, key: string) =>
    apiRequest(`/schedule-sessions/${sessionId}/${action}`, {
      method: 'POST',
      body: { expectedVersion },
      headers: idempotent(key),
      parse: (data) => scheduleSessionSchema.parse(data),
    }),
};
