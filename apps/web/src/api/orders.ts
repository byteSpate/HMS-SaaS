// Service order endpoints (T-ORD-01, T-VIS-02, T-ORD-03; FR-ORD-001..008). Placing carries an Idempotency-Key kept
// across retries (SP-08); every answer is checked against the shared contract.
import {
  diagnosticVisitSchema,
  orderableServiceListSchema,
  serviceOrderListSchema,
  serviceOrderSchema,
  type CancelOrderRequest,
  type CreateDiagnosticVisitRequest,
  type PlaceOrdersRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

export const consultationOrdersKey = (consultationId: string) =>
  ['consultations', consultationId, 'orders'] as const;
export const patientOrdersKey = (patientId: string) => ['patients', patientId, 'orders'] as const;
export const orderableServicesKey = (text: string, direct: boolean) =>
  ['orders', direct ? 'direct-services' : 'services', text] as const;

const parseOrders = (data: unknown) => serviceOrderListSchema.parse(data).orders;

export const ordersApi = {
  /** The doctor's picker (all priced services) or reception's (direct only). */
  services: (text: string, direct: boolean) =>
    apiRequest(`/orders/${direct ? 'direct-services' : 'services'}?q=${encodeURIComponent(text)}`, {
      parse: (data) => orderableServiceListSchema.parse(data).services,
    }),
  forConsultation: (consultationId: string) =>
    apiRequest(`/consultations/${consultationId}/orders`, { parse: parseOrders }),
  placeForConsultation: (consultationId: string, body: PlaceOrdersRequest, key: string) =>
    apiRequest(`/consultations/${consultationId}/orders`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': key },
      parse: parseOrders,
    }),
  /** UC-VIS-02: a diagnostic visit with reception's direct orders. */
  createDiagnosticVisit: (body: CreateDiagnosticVisitRequest, key: string) =>
    apiRequest('/visits/diagnostic', {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': key },
      parse: (data) => diagnosticVisitSchema.parse(data),
    }),
  forPatient: (patientId: string) =>
    apiRequest(`/visits/orders?patientId=${patientId}`, { parse: parseOrders }),
  /** UC-ORD-02 interim rule: only a REQUESTED, unpaid order. */
  cancel: (orderId: string, body: CancelOrderRequest, key: string) =>
    apiRequest(`/orders/${orderId}/cancel`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': key },
      parse: (data) => serviceOrderSchema.parse(data),
    }),
};
