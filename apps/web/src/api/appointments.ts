// Appointment endpoints (T-SCH-02; FR-SCH-002..005; UC-SCH-01/02). Every answer is checked against
// the shared contract. Commands carry an Idempotency-Key made once per dialog or action, so a retry
// after a timeout returns the same booking instead of a second one (SP-08).
import {
  appointmentListSchema,
  appointmentSchema,
  scheduleSessionListSchema,
  type BookAppointmentRequest,
} from '@hms/contracts';
import { apiRequest } from './client';
import { SCHEDULE_SESSIONS_QUERY_KEY } from './schedule-sessions';

const idempotent = (key: string) => ({ 'Idempotency-Key': key });
const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** Under the sessions key, so a booking also refreshes the sessions' booked counts. */
export const APPOINTMENTS_QUERY_KEY = [...SCHEDULE_SESSIONS_QUERY_KEY, 'appointments'] as const;

export const appointmentsApi = {
  ofPatient: (patientId: string) =>
    apiRequest(`/appointments?${query({ patientId })}`, {
      parse: (data) => appointmentListSchema.parse(data).appointments,
    }),
  ofSession: (sessionId: string) =>
    apiRequest(`/appointments?${query({ sessionId })}`, {
      parse: (data) => appointmentListSchema.parse(data).appointments,
    }),
  bookableSessions: (from: string, to: string) =>
    apiRequest(`/appointments/bookable-sessions?${query({ from, to })}`, {
      parse: (data) => scheduleSessionListSchema.parse(data).sessions,
    }),
  book: (body: BookAppointmentRequest, key: string) =>
    apiRequest('/appointments', {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => appointmentSchema.parse(data),
    }),
  reschedule: (appointmentId: string, sessionId: string, expectedVersion: number, key: string) =>
    apiRequest(`/appointments/${appointmentId}/reschedule`, {
      method: 'POST',
      body: { sessionId, expectedVersion },
      headers: idempotent(key),
      parse: (data) => appointmentSchema.parse(data),
    }),
  cancel: (appointmentId: string, reason: string, expectedVersion: number, key: string) =>
    apiRequest(`/appointments/${appointmentId}/cancel`, {
      method: 'POST',
      body: { reason, expectedVersion },
      headers: idempotent(key),
      parse: (data) => appointmentSchema.parse(data),
    }),
  markNoShow: (appointmentId: string, expectedVersion: number, key: string) =>
    apiRequest(`/appointments/${appointmentId}/no-show`, {
      method: 'POST',
      body: { expectedVersion },
      headers: idempotent(key),
      parse: (data) => appointmentSchema.parse(data),
    }),
};
