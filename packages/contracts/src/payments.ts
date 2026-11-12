// Payment contracts (T-BIL-04; FR-BIL-002, FR-BIL-004, FR-BIL-011, FR-BIL-012, FR-BIL-019,
// FR-BIL-027; C-010, C-038, C-039; P-020; ADR-007). The cashier allocates a payment explicitly to
// invoice lines, possibly of several open invoices of one patient (C-039), and the amounts must
// add up to the payment. The server checks every line's remaining amount; the browser never
// decides a balance (FR-BIL-035). Amounts travel as decimal strings with two decimals.
import { z } from 'zod';
import { paymentMethodSchema, staffRefSchema } from './cashier-sessions.js';
import { invoiceSummarySchema, invoiceTypeSchema } from './invoices.js';
import { moneyAmountSchema } from './price-lists.js';
import { practitionerChoiceSchema } from './schedule-sessions.js';

/** A payment amount: more than zero. */
const paidAmountSchema = moneyAmountSchema.refine(
  (amount) => !/^0+\.00$/.test(amount),
  'An amount is more than 0.00',
);

export const paymentAllocationRequestSchema = z.strictObject({
  lineId: z.uuid(),
  amount: paidAmountSchema,
});
export type PaymentAllocationRequest = z.infer<typeof paymentAllocationRequestSchema>;

export const recordPaymentRequestSchema = z
  .strictObject({
    patientId: z.uuid(),
    method: paymentMethodSchema,
    /** For example "bKash" for a mobile payment (FR-BIL-004). */
    providerLabel: z.string().trim().min(1).max(60).optional(),
    /** The transaction or slip number the patient shows. */
    externalReference: z.string().trim().min(1).max(100).optional(),
    amount: paidAmountSchema,
    /** FR-BIL-012: the lines this payment pays and how much of each; the sum is the amount. */
    allocations: z.array(paymentAllocationRequestSchema).min(1).max(50),
  })
  .refine(
    (request) =>
      new Set(request.allocations.map((allocation) => allocation.lineId)).size ===
      request.allocations.length,
    { path: ['allocations'], message: 'Each line once' },
  );
export type RecordPaymentRequest = z.infer<typeof recordPaymentRequestSchema>;

/** A patient as the cashier desk and the receipt show them. */
export const patientRefSchema = z.strictObject({
  patientId: z.uuid(),
  mrn: z.string(),
  nameEn: z.string().nullable(),
  nameBn: z.string().nullable(),
});
export type PatientRef = z.infer<typeof patientRefSchema>;

export const paidLineSchema = z.strictObject({
  lineId: z.uuid(),
  itemCode: z.string(),
  itemNameEn: z.string().nullable(),
  itemNameBn: z.string().nullable(),
  practitioner: practitionerChoiceSchema.nullable(),
  /** What this payment paid of the line. */
  amount: moneyAmountSchema,
});
export type PaidLine = z.infer<typeof paidLineSchema>;

/** One invoice a payment paid (C-039: a receipt may list several). */
export const paidInvoiceSchema = z.strictObject({
  invoiceId: z.uuid(),
  number: z.string(),
  type: invoiceTypeSchema,
  /** What this payment paid of the invoice. */
  paid: moneyAmountSchema,
  /** FR-BIL-027: the invoice's balance right after this payment. */
  balanceAfter: moneyAmountSchema,
  lines: z.array(paidLineSchema),
});
export type PaidInvoice = z.infer<typeof paidInvoiceSchema>;

export const paymentSchema = z.strictObject({
  paymentId: z.uuid(),
  receiptNumber: z.string(),
  patient: patientRefSchema,
  sessionId: z.uuid(),
  method: paymentMethodSchema,
  providerLabel: z.string().nullable(),
  externalReference: z.string().nullable(),
  amount: moneyAmountSchema,
  receivedAt: z.iso.datetime(),
  cashier: staffRefSchema,
  /** Doctor fee first, then services (C-008). */
  invoices: z.array(paidInvoiceSchema),
  /** How often the receipt was printed; the next print is copy printCount + 1. */
  printCount: z.number().int(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const paymentListQuerySchema = z.strictObject({ sessionId: z.uuid() });
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export const paymentListSchema = z.strictObject({ payments: z.array(paymentSchema) });
export type PaymentList = z.infer<typeof paymentListSchema>;

export const PRINT_LANGUAGES = ['en', 'bn-BD', 'bilingual'] as const;
export const printLanguageSchema = z.enum(PRINT_LANGUAGES);

export const printReceiptRequestSchema = z.strictObject({ language: printLanguageSchema });
export type PrintReceiptRequest = z.infer<typeof printReceiptRequestSchema>;

/** FR-BIL-027: the printable receipt; copy 2 and later say "Copy n" on the page. */
export const receiptPrintSchema = z.strictObject({
  copyNo: z.number().int(),
  html: z.string(),
});
export type ReceiptPrint = z.infer<typeof receiptPrintSchema>;

/** The cashier desk's queue: patients with open invoices issued today (SCR-06). */
export const cashierQueueSchema = z.strictObject({
  patients: z.array(
    z.strictObject({
      patient: patientRefSchema,
      invoices: z.array(invoiceSummarySchema),
    }),
  ),
});
export type CashierQueue = z.infer<typeof cashierQueueSchema>;
