// Cashier session endpoints (T-BIL-03; FR-BIL-026; UC-BIL-04). Every answer is checked against the
// shared contract. Commands carry an Idempotency-Key made once per dialog (SP-08) and the
// session's version (SP-03).
import {
  cashierSessionListSchema,
  cashierSessionSchema,
  currentCashierSessionSchema,
  type CashierSessionListQuery,
  type CloseCashierSessionRequest,
  type OpenCashierSessionRequest,
  type ReviewCashierSessionRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export const CASHIER_SESSION_QUERY_KEY = ['cashier-sessions'] as const;

export const cashierSessionsApi = {
  current: () =>
    apiRequest('/billing/cashier-sessions/current', {
      parse: (data) => currentCashierSessionSchema.parse(data).session,
    }),
  open: (body: OpenCashierSessionRequest, key: string) =>
    apiRequest('/billing/cashier-sessions', {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => cashierSessionSchema.parse(data),
    }),
  close: (sessionId: string, body: CloseCashierSessionRequest, key: string) =>
    apiRequest(`/billing/cashier-sessions/${sessionId}/close`, {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => cashierSessionSchema.parse(data),
    }),
  list: (status: CashierSessionListQuery['status']) =>
    apiRequest(`/billing/cashier-sessions?status=${status}`, {
      parse: (data) => cashierSessionListSchema.parse(data).sessions,
    }),
  review: (sessionId: string, body: ReviewCashierSessionRequest, key: string) =>
    apiRequest(`/billing/cashier-sessions/${sessionId}/review`, {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => cashierSessionSchema.parse(data),
    }),
};
