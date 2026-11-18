// Service catalogue contracts (T-ORD-01; FR-ORD-001, FR-ORD-007, FR-CFG-001, FR-I18N-006; owner
// choice 2026-11-18: billing's catalogue holds the orderable services). The administrator keeps
// the tests, imaging and procedures with their names, whether reception may order them directly
// (CP-01), and the expected reporting time. Prices are set in the price list (price-lists.ts).
// The code and the category never change: the category decides the invoice (C-008).
import { z } from 'zod';
import { moneyAmountSchema } from './price-lists.js';

/** The categories an order can be for; CONSULTATION (doctor fees), MEDICINE and BED are not. */
export const ORDERABLE_CATEGORIES = ['LAB', 'IMAGING', 'PROCEDURE', 'OTHER'] as const;
export const orderableCategorySchema = z.enum(ORDERABLE_CATEGORIES);
export type OrderableCategory = z.infer<typeof orderableCategorySchema>;

const serviceCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_-]{0,39}$/, 'Use up to 40 letters, digits, hyphens or underscores');

const serviceName = z.string().trim().min(1).max(120).nullable().optional();

const editableFields = {
  nameBn: serviceName,
  nameEn: serviceName,
  directlyOrderable: z.boolean(),
  /** FR-ORD-007: hours from order to report, 1-720; null when there is no report. */
  reportHours: z.number().int().min(1).max(720).nullable(),
};

type Names = { nameBn?: string | null; nameEn?: string | null };

/** FR-I18N-006: a name in at least one script. */
function checkName(value: Names, context: z.RefinementCtx): void {
  if (!value.nameBn && !value.nameEn) {
    context.addIssue({
      code: 'custom',
      path: ['nameEn'],
      message: 'Enter the name in Bangla or English',
    });
  }
}

export const createServiceRequestSchema = z
  .strictObject({ code: serviceCode, category: orderableCategorySchema, ...editableFields })
  .superRefine(checkName);
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;

export const updateServiceRequestSchema = z
  .strictObject({
    ...editableFields,
    active: z.boolean(),
    expectedVersion: z.number().int().min(1),
  })
  .superRefine(checkName);
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;

export const serviceRecordSchema = z.strictObject({
  serviceItemId: z.uuid(),
  code: z.string(),
  category: orderableCategorySchema,
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
  directlyOrderable: z.boolean(),
  reportHours: z.number().int().nullable(),
  active: z.boolean(),
  version: z.number().int(),
});
export type ServiceRecord = z.infer<typeof serviceRecordSchema>;

export const serviceListSchema = z.strictObject({ services: z.array(serviceRecordSchema) });
export type ServiceList = z.infer<typeof serviceListSchema>;

/** A service as another record names it: a price list row, an order. */
export const serviceChoiceSchema = z.strictObject({
  serviceItemId: z.uuid(),
  code: z.string(),
  category: orderableCategorySchema,
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
});
export type ServiceChoice = z.infer<typeof serviceChoiceSchema>;

/** What an order picker offers: an active service with its price in force now. */
export const orderableServiceSchema = serviceChoiceSchema.extend({
  directlyOrderable: z.boolean(),
  reportHours: z.number().int().nullable(),
  unitPrice: moneyAmountSchema,
  /** The catalogue version an order keeps (FR-ORD-002). */
  version: z.number().int(),
});
export type OrderableService = z.infer<typeof orderableServiceSchema>;
