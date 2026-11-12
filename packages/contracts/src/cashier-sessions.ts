// Cashier session contracts (T-BIL-03; FR-BIL-026; UC-BIL-04; ADR-007). A cashier opens a session
// with an optional cash float, records payments in it, and closes it with the amount counted for
// each payment method. The server computes what was expected and the variance; a finance user
// other than the cashier reviews it. Amounts travel as decimal strings with two decimals.
import { z } from 'zod';
import { moneyAmountSchema, signedMoneyAmountSchema } from './price-lists.js';

/** FR-BIL-004, C-010: the actual method a patient paid with. */
export const PAYMENT_METHODS = ['CASH', 'CARD', 'MOBILE', 'BANK_TRANSFER'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const CASHIER_SESSION_STATUSES = ['OPEN', 'CLOSED_PENDING_REVIEW', 'REVIEWED'] as const;
export const cashierSessionStatusSchema = z.enum(CASHIER_SESSION_STATUSES);
export type CashierSessionStatus = z.infer<typeof cashierSessionStatusSchema>;

/** A staff member as other screens show them. */
export const staffRefSchema = z.strictObject({ userId: z.uuid(), displayName: z.string() });
export type StaffRef = z.infer<typeof staffRefSchema>;

export const cashierSessionTotalSchema = z.strictObject({
  method: paymentMethodSchema,
  /** From the session's payments; for CASH it includes the opening float. */
  expected: moneyAmountSchema,
  /** What the cashier counted at closing; null while the session is open. */
  counted: moneyAmountSchema.nullable(),
  /** counted - expected; negative when money is missing. Null while open. */
  variance: signedMoneyAmountSchema.nullable(),
});
export type CashierSessionTotal = z.infer<typeof cashierSessionTotalSchema>;

export const cashierSessionSchema = z.strictObject({
  sessionId: z.uuid(),
  cashier: staffRefSchema,
  status: cashierSessionStatusSchema,
  openingFloat: moneyAmountSchema,
  openedAt: z.iso.datetime(),
  closedAt: z.iso.datetime().nullable(),
  /** One row per method, always in PAYMENT_METHODS order. */
  totals: z.array(cashierSessionTotalSchema),
  /** True when any method's variance is not zero; the reviewer must then write a note. */
  hasVariance: z.boolean(),
  review: z
    .strictObject({
      reviewedBy: staffRefSchema,
      reviewedAt: z.iso.datetime(),
      note: z.string().nullable(),
    })
    .nullable(),
  version: z.number().int(),
});
export type CashierSession = z.infer<typeof cashierSessionSchema>;

/** The signed-in cashier's open session, or null when there is none. */
export const currentCashierSessionSchema = z.strictObject({
  session: cashierSessionSchema.nullable(),
});
export type CurrentCashierSession = z.infer<typeof currentCashierSessionSchema>;

export const openCashierSessionRequestSchema = z.strictObject({
  /** Cash in the drawer at the start; 0.00 when omitted (FR-BIL-026: optional). */
  openingFloat: moneyAmountSchema.optional(),
});
export type OpenCashierSessionRequest = z.infer<typeof openCashierSessionRequestSchema>;

export const closeCashierSessionRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  /** The amount counted for every method, 0.00 for a method not used. */
  counted: z.strictObject({
    CASH: moneyAmountSchema,
    CARD: moneyAmountSchema,
    MOBILE: moneyAmountSchema,
    BANK_TRANSFER: moneyAmountSchema,
  }),
});
export type CloseCashierSessionRequest = z.infer<typeof closeCashierSessionRequestSchema>;

export const reviewCashierSessionRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  /** Required when the session has a variance: why the finance user accepts it. */
  note: z.string().trim().max(500).optional(),
});
export type ReviewCashierSessionRequest = z.infer<typeof reviewCashierSessionRequestSchema>;

export const cashierSessionListQuerySchema = z.strictObject({
  status: z.enum(['CLOSED_PENDING_REVIEW', 'REVIEWED']).default('CLOSED_PENDING_REVIEW'),
});
export type CashierSessionListQuery = z.infer<typeof cashierSessionListQuerySchema>;

export const cashierSessionListSchema = z.strictObject({
  sessions: z.array(cashierSessionSchema),
});
export type CashierSessionList = z.infer<typeof cashierSessionListSchema>;
