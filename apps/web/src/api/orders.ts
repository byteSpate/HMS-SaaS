// Service order endpoints (T-ORD-01, T-VIS-02, T-ORD-03, T-ORD-02; FR-ORD-001..008, FR-LAB-004). Placing carries an Idempotency-Key kept
// across retries (SP-08); every answer is checked against the shared contract.
import {
  departmentWorklistSchema,
  diagnosticVisitSchema,
  orderableServiceListSchema,
  serviceOrderListSchema,
  serviceOrderSchema,
  type CancelOrderRequest,
  type CreateDiagnosticVisitRequest,
  type OrderableCategory,
  type PlaceOrdersRequest,
  type StartOrderRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

export const consultationOrdersKey = (consultationId: string) =>
  ['consultations', consultationId, 'orders'] as const;
/** T-ORD-02: every category shares the prefix, so a start refreshes all of them. */
export const departmentWorklistKey = (category: OrderableCategory | null) =>
  ['orders', 'worklist', category ?? 'ALL'] as const;
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
  /** T-ORD-02 (FR-LAB-004): today's waiting and in-progress orders with the patient. */
  departmentWorklist: (category: OrderableCategory | null) =>
    apiRequest(category ? `/orders/worklist?category=${category}` : '/orders/worklist', {
      parse: (data) => departmentWorklistSchema.parse(data).orders,
    }),
  /** T-ORD-02 (FR-BIL-003): the server refuses an unpaid order with PAYMENT_NOT_ELIGIBLE. */
  start: (orderId: string, body: StartOrderRequest, key: string) =>
    apiRequest(`/orders/${orderId}/start`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': key },
      parse: (data) => serviceOrderSchema.parse(data),
    }),
};
