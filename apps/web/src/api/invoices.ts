// Invoice reads for the cashier desk (T-BIL-04; SCR-06; FR-BIL-035). Every answer is checked
// against the shared contract; balances and eligibility come from the server, never the browser.
import { cashierQueueSchema, invoiceListSchema } from '@hms/contracts';
import { apiRequest } from './client';

export const INVOICES_QUERY_KEY = ['invoices'] as const;

export const invoicesApi = {
  /** The patient's invoices that still owe money. */
  openOfPatient: (patientId: string) =>
    apiRequest(`/billing/invoices?patientId=${patientId}&open=true`, {
      parse: (data) => invoiceListSchema.parse(data).invoices,
    }),
  /** Patients with invoices issued today that still owe. */
  queue: () =>
    apiRequest('/billing/invoices/queue', {
      parse: (data) => cashierQueueSchema.parse(data).patients,
    }),
};
