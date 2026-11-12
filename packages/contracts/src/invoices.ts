// Invoice contracts (T-BIL-02, T-BIL-04; FR-BIL-001, FR-BIL-008, FR-BIL-030, FR-BIL-031; C-008;
// ADR-007). A visit has a DOCTOR_FEE invoice and, with orders, a SERVICE invoice. Totals, balances,
// payments per line and subtotals are computed by the server; the client never adds amounts.
import { z } from 'zod';
import { moneyAmountSchema } from './price-lists.js';
import { practitionerChoiceSchema } from './schedule-sessions.js';

export const INVOICE_TYPES = ['DOCTOR_FEE', 'SERVICE'] as const;
export const invoiceTypeSchema = z.enum(INVOICE_TYPES);
export type InvoiceType = z.infer<typeof invoiceTypeSchema>;

export const INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceLineSchema = z.strictObject({
  lineId: z.uuid(),
  lineNo: z.number().int(),
  /** The catalogue code; the screens name system items such as DOCTOR_FEE_NEW from it. */
  itemCode: z.string(),
  itemNameEn: z.string().nullable(),
  itemNameBn: z.string().nullable(),
  /** The doctor of a doctor-fee line. */
  practitioner: practitionerChoiceSchema.nullable(),
  quantity: z.number().int(),
  unitPrice: moneyAmountSchema,
  amount: moneyAmountSchema,
  category: z.enum(['MEDICINE', 'NON_MEDICINE']),
  status: z.enum(['ACTIVE', 'CANCELLED', 'REVERSED']),
  /** T-BIL-04: paid so far, and what is still owed on the line. */
  allocatedAmount: moneyAmountSchema,
  balance: moneyAmountSchema,
  /** C-040 FULL_PAYMENT: a service may start only when its line is fully paid (FR-BIL-003). */
  eligibility: z.enum(['ELIGIBLE', 'NOT_ELIGIBLE']),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

/** What another screen shows of an invoice, for example check-in's "doctor fee due". */
export const invoiceSummarySchema = z.strictObject({
  invoiceId: z.uuid(),
  number: z.string(),
  type: invoiceTypeSchema,
  status: invoiceStatusSchema,
  total: moneyAmountSchema,
  paid: moneyAmountSchema,
  balance: moneyAmountSchema,
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

export const invoiceSchema = invoiceSummarySchema.extend({
  patientId: z.uuid(),
  visitId: z.uuid(),
  currency: z.string().length(3),
  /** SRC-B03, FR-BIL-030: medicine and other lines are subtotalled independently. */
  subtotals: z.strictObject({ medicine: moneyAmountSchema, nonMedicine: moneyAmountSchema }),
  issuedAt: z.iso.datetime(),
  version: z.number().int(),
  lines: z.array(invoiceLineSchema),
});
export type Invoice = z.infer<typeof invoiceSchema>;

/**
 * A visit's invoices, or a patient's (T-BIL-04 cashier desk). `open=true` keeps only invoices
 * that still owe money (ISSUED, PARTIALLY_PAID).
 */
export const invoiceListQuerySchema = z
  .strictObject({
    visitId: z.uuid().optional(),
    patientId: z.uuid().optional(),
    open: z.enum(['true', 'false']).optional(),
  })
  .refine((query) => (query.visitId === undefined) !== (query.patientId === undefined), {
    path: ['visitId'],
    message: 'Give a visitId or a patientId',
  });
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const invoiceListSchema = z.strictObject({ invoices: z.array(invoiceSchema) });
export type InvoiceList = z.infer<typeof invoiceListSchema>;
