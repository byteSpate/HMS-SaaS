// Practitioner master endpoints (T-PRA-01; FR-PRA-001..003). Every answer is checked against the
// shared contract. Commands carry an Idempotency-Key made once per dialog, so a retry after a
// timeout returns the same practitioner instead of a second one (SP-08).
import {
  departmentChoiceListSchema,
  practitionerListSchema,
  practitionerSchema,
  type CreatePractitionerRequest,
  type UpdatePractitionerRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export const PRACTITIONERS_QUERY_KEY = ['practitioners'] as const;

/** Under the practitioners key, so saving a practitioner also refreshes it. */
export const DEPARTMENT_CHOICES_QUERY_KEY = [
  ...PRACTITIONERS_QUERY_KEY,
  'department-choices',
] as const;

export const practitionersApi = {
  departmentChoices: () =>
    apiRequest('/practitioners/department-choices', {
      parse: (data) => departmentChoiceListSchema.parse(data).departments,
    }),
  list: () =>
    apiRequest('/practitioners', {
      parse: (data) => practitionerListSchema.parse(data).practitioners,
    }),
  create: (body: CreatePractitionerRequest, key: string) =>
    apiRequest('/practitioners', {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => practitionerSchema.parse(data),
    }),
  update: (practitionerId: string, body: UpdatePractitionerRequest, key: string) =>
    apiRequest(`/practitioners/${practitionerId}`, {
      method: 'PUT',
      body,
      headers: idempotent(key),
      parse: (data) => practitionerSchema.parse(data),
    }),
};
