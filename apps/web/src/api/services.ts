// Service catalogue endpoints (T-ORD-01; FR-ORD-001, FR-ORD-007). Every answer is checked against
// the shared contract. A repeated create is refused by the code rule, so no Idempotency-Key.
import {
  serviceListSchema,
  serviceRecordSchema,
  type CreateServiceRequest,
  type UpdateServiceRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

export const SERVICES_QUERY_KEY = ['services'] as const;

export const servicesApi = {
  list: () =>
    apiRequest('/billing/services', { parse: (data) => serviceListSchema.parse(data).services }),
  create: (body: CreateServiceRequest) =>
    apiRequest('/billing/services', {
      method: 'POST',
      body,
      parse: (data) => serviceRecordSchema.parse(data),
    }),
  update: (serviceItemId: string, body: UpdateServiceRequest) =>
    apiRequest(`/billing/services/${serviceItemId}`, {
      method: 'PUT',
      body,
      parse: (data) => serviceRecordSchema.parse(data),
    }),
};
