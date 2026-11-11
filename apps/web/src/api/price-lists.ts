// Price list endpoints (T-BIL-01; FR-CFG-002; C-041). Every answer is checked against the shared
// contract. Commands carry an Idempotency-Key made once per dialog or action (SP-08), and edits
// carry the draft's version (SP-03).
import {
  practitionerChoiceListSchema,
  priceListChangesSchema,
  priceListListSchema,
  priceListSchema,
  type PublishPriceListRequest,
  type SetDoctorFeeRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export const PRICE_LISTS_QUERY_KEY = ['price-lists'] as const;

export const priceListsApi = {
  list: () =>
    apiRequest('/billing/price-lists', {
      parse: (data) => priceListListSchema.parse(data).priceLists,
    }),
  get: (priceListId: string) =>
    apiRequest(`/billing/price-lists/${priceListId}`, {
      parse: (data) => priceListSchema.parse(data),
    }),
  changes: (priceListId: string) =>
    apiRequest(`/billing/price-lists/${priceListId}/changes`, {
      parse: (data) => priceListChangesSchema.parse(data),
    }),
  practitionerChoices: () =>
    apiRequest('/billing/price-lists/practitioner-choices', {
      parse: (data) => practitionerChoiceListSchema.parse(data).practitioners,
    }),
  createDraft: (key: string) =>
    apiRequest('/billing/price-lists', {
      method: 'POST',
      body: {},
      headers: idempotent(key),
      parse: (data) => priceListSchema.parse(data),
    }),
  setDoctorFee: (
    priceListId: string,
    practitionerId: string,
    body: SetDoctorFeeRequest,
    key: string,
  ) =>
    apiRequest(`/billing/price-lists/${priceListId}/doctor-fees/${practitionerId}`, {
      method: 'PUT',
      body,
      headers: idempotent(key),
      parse: (data) => priceListSchema.parse(data),
    }),
  removeDoctorFee: (
    priceListId: string,
    practitionerId: string,
    expectedVersion: number,
    key: string,
  ) =>
    apiRequest(`/billing/price-lists/${priceListId}/doctor-fees/${practitionerId}/remove`, {
      method: 'POST',
      body: { expectedVersion },
      headers: idempotent(key),
      parse: (data) => priceListSchema.parse(data),
    }),
  publish: (priceListId: string, body: PublishPriceListRequest, key: string) =>
    apiRequest(`/billing/price-lists/${priceListId}/publish`, {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse: (data) => priceListSchema.parse(data),
    }),
};
