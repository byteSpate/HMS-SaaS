// Patient registry endpoints (T-PAT-01..04; UC-PAT-01, UC-PAT-02). Every answer is checked against the
// shared contract. Commands carry an Idempotency-Key made once per screen action, so a retry after a
// timeout returns the same patient instead of a second one (FR-PAT-002, SP-08).
import {
  duplicateCandidatesResponseSchema,
  patientDetailSchema,
  patientSearchResponseSchema,
  patientVersionSchema,
  registeredPatientSchema,
  revealedNidSchema,
  type DuplicateCandidatesRequest,
  type RegisterPatientRequest,
  type UpdatePatientIdentityRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export const patientsApi = {
  search: (term: string) =>
    apiRequest('/patients/search', {
      method: 'POST',
      body: { term },
      parse: (data) => patientSearchResponseSchema.parse(data),
    }),
  candidates: (body: DuplicateCandidatesRequest) =>
    apiRequest('/patients/duplicate-candidates', {
      method: 'POST',
      body,
      parse: (data) => duplicateCandidatesResponseSchema.parse(data).candidates,
    }),
  register: (body: RegisterPatientRequest, key: string) =>
    apiRequest('/patients', {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => registeredPatientSchema.parse(data),
    }),
  detail: (patientId: string) =>
    apiRequest(`/patients/${patientId}`, { parse: (data) => patientDetailSchema.parse(data) }),
  correct: (patientId: string, body: UpdatePatientIdentityRequest, key: string) =>
    apiRequest(`/patients/${patientId}/identity`, {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => patientVersionSchema.parse(data),
    }),
  revealNid: (patientId: string) =>
    apiRequest(`/patients/${patientId}/nid/reveal`, {
      method: 'POST',
      parse: (data) => revealedNidSchema.parse(data).nid,
    }),
};

export const patientQueryKeys = {
  search: (term: string) => ['patients', 'search', term] as const,
  detail: (patientId: string) => ['patients', 'detail', patientId] as const,
};
