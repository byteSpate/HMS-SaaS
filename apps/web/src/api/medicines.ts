// Medicine catalogue and prescribing list endpoints (T-CLI-03; FR-CLI-004; Q-067 interim). Every
// answer is checked against the shared contract. The administrator's edits need no
// Idempotency-Key, like the department master: a repeated medicine is refused by the
// brand-strength-form rule, and a repeated term is harmless and visible in the list.
import {
  medicineChoiceListSchema,
  medicineListSchema,
  medicineRecordSchema,
  prescribingTermChoicesSchema,
  prescribingTermListSchema,
  prescribingTermRecordSchema,
  type CreateMedicineRequest,
  type CreatePrescribingTermRequest,
  type UpdateMedicineRequest,
  type UpdatePrescribingTermRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

export const MEDICINES_QUERY_KEY = ['medicines'] as const;
export const PRESCRIBING_TERMS_QUERY_KEY = ['prescribing-terms'] as const;

export const medicinesApi = {
  list: () =>
    apiRequest('/admin/medicines', {
      parse: (data) => medicineListSchema.parse(data).medicines,
    }),
  create: (body: CreateMedicineRequest) =>
    apiRequest('/admin/medicines', {
      method: 'POST',
      body,
      parse: (data) => medicineRecordSchema.parse(data),
    }),
  update: (medicineId: string, body: UpdateMedicineRequest) =>
    apiRequest(`/admin/medicines/${medicineId}`, {
      method: 'PUT',
      body,
      parse: (data) => medicineRecordSchema.parse(data),
    }),
};

export const prescribingTermsApi = {
  list: () =>
    apiRequest('/admin/prescribing-terms', {
      parse: (data) => prescribingTermListSchema.parse(data).terms,
    }),
  create: (body: CreatePrescribingTermRequest) =>
    apiRequest('/admin/prescribing-terms', {
      method: 'POST',
      body,
      parse: (data) => prescribingTermRecordSchema.parse(data),
    }),
  update: (termId: string, body: UpdatePrescribingTermRequest) =>
    apiRequest(`/admin/prescribing-terms/${termId}`, {
      method: 'PUT',
      body,
      parse: (data) => prescribingTermRecordSchema.parse(data),
    }),
};

/** What the doctor picks from while writing a prescription. */
export const prescribingApi = {
  searchMedicines: (text: string) =>
    apiRequest(`/prescribing/medicines?q=${encodeURIComponent(text)}`, {
      parse: (data) => medicineChoiceListSchema.parse(data).medicines,
    }),
  terms: () =>
    apiRequest('/prescribing/terms', {
      parse: (data) => prescribingTermChoicesSchema.parse(data),
    }),
};
