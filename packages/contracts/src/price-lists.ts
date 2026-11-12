// Price list contracts (T-BIL-01; FR-CFG-001, FR-CFG-002, FR-BIL-007; C-041; ADR-007). An
// administrator edits the hospital's doctor fees in a DRAFT price list version, previews what
// changes against the version in force, and publishes it now or from a later time. A doctor fee
// is a new-patient fee, a follow-up fee, and the follow-up window in days. Amounts travel as
// decimal strings with two decimals ("500.00"), never as JSON numbers.
import { z } from 'zod';
import { practitionerChoiceSchema } from './schedule-sessions.js';

/** ADR-007: an amount of BDT with two decimals, as a string. */
export const moneyAmountSchema = z
  .string()
  .regex(/^\d{1,16}\.\d{2}$/, 'Give an amount with two decimals, for example 500.00');
export type MoneyAmount = z.infer<typeof moneyAmountSchema>;

/** An amount that may be negative, such as a cashier session's variance (T-BIL-03). */
export const signedMoneyAmountSchema = z
  .string()
  .regex(/^-?\d{1,16}\.\d{2}$/, 'Give an amount with two decimals, for example -20.00');

/** C-041 allows no reductions, so a doctor fee is always more than zero. */
const feeSchema = moneyAmountSchema.refine(
  (amount) => !/^0+\.00$/.test(amount),
  'A fee is more than 0.00',
);

const expectedVersion = z.number().int().min(1);

export const PRICE_LIST_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
export const priceListStatusSchema = z.enum(PRICE_LIST_STATUSES);
export type PriceListStatus = z.infer<typeof priceListStatusSchema>;

export const doctorFeeSchema = z.strictObject({
  practitioner: practitionerChoiceSchema,
  newPatientFee: moneyAmountSchema,
  followUpFee: moneyAmountSchema,
  /** A return within this many days of the last consultation with this doctor is a follow-up. */
  followUpDays: z.number().int(),
});
export type DoctorFee = z.infer<typeof doctorFeeSchema>;

export const priceListSummarySchema = z.strictObject({
  priceListId: z.uuid(),
  versionNo: z.number().int(),
  status: priceListStatusSchema,
  /** When a published version takes effect; null for the draft. */
  effectiveFrom: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  /** The published version that prices records now. */
  inForce: z.boolean(),
  doctorFeeCount: z.number().int(),
  version: z.number().int(),
});
export type PriceListSummary = z.infer<typeof priceListSummarySchema>;

export const priceListListSchema = z.strictObject({
  priceLists: z.array(priceListSummarySchema),
});
export type PriceListList = z.infer<typeof priceListListSchema>;

export const priceListSchema = priceListSummarySchema.extend({
  doctorFees: z.array(doctorFeeSchema),
});
export type PriceList = z.infer<typeof priceListSchema>;

/** Sets one doctor's fee in the draft, with the draft version the screen showed (SP-03). */
export const setDoctorFeeRequestSchema = z.strictObject({
  newPatientFee: feeSchema,
  followUpFee: feeSchema,
  followUpDays: z.number().int().min(1).max(365),
  expectedVersion,
});
export type SetDoctorFeeRequest = z.infer<typeof setDoctorFeeRequestSchema>;

/** Removes one doctor's fee from the draft, with the draft version the screen showed. */
export const removeDoctorFeeRequestSchema = z.strictObject({ expectedVersion });
export type RemoveDoctorFeeRequest = z.infer<typeof removeDoctorFeeRequestSchema>;

/** FR-CFG-002: now when no time is given, otherwise a time that has not passed. */
export const publishPriceListRequestSchema = z.strictObject({
  effectiveFrom: z.iso.datetime({ offset: true }).optional(),
  expectedVersion,
});
export type PublishPriceListRequest = z.infer<typeof publishPriceListRequestSchema>;

export const PRICE_LIST_CHANGE_KINDS = ['ADDED', 'CHANGED', 'REMOVED'] as const;

const feeValuesSchema = z.strictObject({
  newPatientFee: moneyAmountSchema,
  followUpFee: moneyAmountSchema,
  followUpDays: z.number().int(),
});

export const priceListChangeSchema = z.strictObject({
  practitioner: practitionerChoiceSchema,
  change: z.enum(PRICE_LIST_CHANGE_KINDS),
  before: feeValuesSchema.nullable(),
  after: feeValuesSchema.nullable(),
});
export type PriceListChange = z.infer<typeof priceListChangeSchema>;

/** FR-CFG-002: the preview before publishing, against the version in force now. */
export const priceListChangesSchema = z.strictObject({
  comparedWithVersionNo: z.number().int().nullable(),
  changes: z.array(priceListChangeSchema),
});
export type PriceListChanges = z.infer<typeof priceListChangesSchema>;
