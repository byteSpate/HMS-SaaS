// Payment endpoints (T-BIL-04; FR-BIL-011, FR-BIL-027). Every answer is checked against the shared
// contract. A payment carries an Idempotency-Key made once per payment attempt (SP-08), so a retry
// after a timeout returns the same payment and receipt instead of charging twice (FPR-08).
import {
  paymentListSchema,
  paymentSchema,
  receiptPrintSchema,
  type PrintReceiptRequest,
  type RecordPaymentRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export const PAYMENTS_QUERY_KEY = ['payments'] as const;

export const paymentsApi = {
  record: (body: RecordPaymentRequest, key: string) =>
    apiRequest('/billing/payments', {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => paymentSchema.parse(data),
    }),
  ofSession: (sessionId: string) =>
    apiRequest(`/billing/payments?sessionId=${sessionId}`, {
      parse: (data) => paymentListSchema.parse(data).payments,
    }),
  print: (paymentId: string, body: PrintReceiptRequest, key: string) =>
    apiRequest(`/billing/payments/${paymentId}/prints`, {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => receiptPrintSchema.parse(data),
    }),
};
