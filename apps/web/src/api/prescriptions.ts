// Prescription endpoints (T-CLI-03; FR-CLI-004..006; UC-CLI-01 steps 4 and 5; UC-CLI-02). Every
// command carries the prescription's version (SP-03) and an Idempotency-Key (SP-08); every answer
// is checked against the shared contract.
import {
  prescriptionPrintSchema,
  prescriptionSchema,
  type AmendPrescriptionRequest,
  type PrescriptionVersionRequest,
  type PrintPrescriptionRequest,
  type SavePrescriptionDraftRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

export const prescriptionQueryKey = (consultationId: string) =>
  ['consultations', consultationId, 'prescription'] as const;
export const PRESCRIBING_TERM_CHOICES_KEY = ['prescribing', 'terms'] as const;
export const medicineSearchKey = (text: string) => ['prescribing', 'medicines', text] as const;

const path = (consultationId: string, action = '') =>
  `/consultations/${consultationId}/prescription${action}`;
const parse = (data: unknown) => prescriptionSchema.parse(data);
const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export const prescriptionsApi = {
  read: (consultationId: string) => apiRequest(path(consultationId), { parse }),
  saveDraft: (consultationId: string, body: SavePrescriptionDraftRequest, key: string) =>
    apiRequest(path(consultationId, '/draft'), {
      method: 'PUT',
      body,
      headers: idempotent(key),
      parse,
    }),
  sign: (consultationId: string, body: PrescriptionVersionRequest, key: string) =>
    apiRequest(path(consultationId, '/sign'), {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse,
    }),
  amend: (consultationId: string, body: AmendPrescriptionRequest, key: string) =>
    apiRequest(path(consultationId, '/amend'), {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse,
    }),
  discard: (consultationId: string, body: PrescriptionVersionRequest, key: string) =>
    apiRequest(path(consultationId, '/discard'), {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse,
    }),
  print: (consultationId: string, body: PrintPrescriptionRequest, key: string) =>
    apiRequest(path(consultationId, '/prints'), {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => prescriptionPrintSchema.parse(data),
    }),
};
