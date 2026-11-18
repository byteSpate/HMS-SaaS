// Medicine catalogue and prescribing list contracts (T-CLI-03; FR-CLI-004, FR-PHA-011 subset;
// FR-I18N-006; Q-067 interim: catalogue-based prescription lines, vocabularies entered by the
// hospital). The hospital administrator keeps both; the doctor picks from the active entries.
// Stock, batches and packs are not here: they come with the pharmacy epic (Phase 4).
import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

const medicineFields = {
  brandName: requiredText(120),
  genericName: requiredText(120),
  strength: optionalText(60),
  form: requiredText(60),
  nameBn: optionalText(120),
  manufacturer: optionalText(120),
};

export const createMedicineRequestSchema = z.strictObject(medicineFields);
export type CreateMedicineRequest = z.infer<typeof createMedicineRequestSchema>;

/**
 * The whole record as the form shows it, with the version it was read at (SP-03). An optional
 * text left out or null is cleared. `active: false` hides the medicine from the doctor's picker;
 * it is never deleted, because signed prescriptions point at it.
 */
export const updateMedicineRequestSchema = z.strictObject({
  ...medicineFields,
  active: z.boolean(),
  expectedVersion: z.number().int().min(1),
});
export type UpdateMedicineRequest = z.infer<typeof updateMedicineRequestSchema>;

export const medicineRecordSchema = z.strictObject({
  medicineId: z.uuid(),
  brandName: z.string(),
  genericName: z.string(),
  strength: z.string().nullable(),
  form: z.string(),
  nameBn: z.string().nullable(),
  manufacturer: z.string().nullable(),
  active: z.boolean(),
  version: z.number().int(),
});
export type MedicineRecord = z.infer<typeof medicineRecordSchema>;

export const medicineListSchema = z.strictObject({ medicines: z.array(medicineRecordSchema) });
export type MedicineList = z.infer<typeof medicineListSchema>;

/** What a prescription line shows of a medicine, and keeps as it was when written. */
export const medicineChoiceSchema = z.strictObject({
  medicineId: z.uuid(),
  brandName: z.string(),
  genericName: z.string(),
  strength: z.string().nullable(),
  form: z.string(),
  nameBn: z.string().nullable(),
});
export type MedicineChoice = z.infer<typeof medicineChoiceSchema>;

/** The doctor's picker: active medicines whose brand or generic name contains the text. */
export const medicineSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(60),
});
export type MedicineSearchQuery = z.infer<typeof medicineSearchQuerySchema>;

export const MEDICINE_SEARCH_LIMIT = 20;

export const medicineChoiceListSchema = z.strictObject({
  medicines: z.array(medicineChoiceSchema).max(MEDICINE_SEARCH_LIMIT),
});
export type MedicineChoiceList = z.infer<typeof medicineChoiceListSchema>;

export const PRESCRIBING_TERM_KINDS = ['ROUTE', 'FREQUENCY', 'DURATION'] as const;
export const prescribingTermKindSchema = z.enum(PRESCRIBING_TERM_KINDS);
export type PrescribingTermKind = z.infer<typeof prescribingTermKindSchema>;

const termLabel = optionalText(80);
const termFields = {
  labelBn: termLabel,
  labelEn: termLabel,
  sortOrder: z.number().int().min(0).max(9999).default(0),
};

type TermLabels = { labelBn?: string | null; labelEn?: string | null };

/** FR-I18N-006: a label in at least one script. */
function checkLabel(value: TermLabels, context: z.RefinementCtx): void {
  if (!value.labelBn && !value.labelEn) {
    context.addIssue({
      code: 'custom',
      path: ['labelEn'],
      message: 'Enter the label in Bangla or English',
    });
  }
}

export const createPrescribingTermRequestSchema = z
  .strictObject({ kind: prescribingTermKindSchema, ...termFields })
  .superRefine(checkLabel);
export type CreatePrescribingTermRequest = z.infer<typeof createPrescribingTermRequestSchema>;

/** The kind never changes; the rest is the whole record with its version (SP-03). */
export const updatePrescribingTermRequestSchema = z
  .strictObject({
    ...termFields,
    active: z.boolean(),
    expectedVersion: z.number().int().min(1),
  })
  .superRefine(checkLabel);
export type UpdatePrescribingTermRequest = z.infer<typeof updatePrescribingTermRequestSchema>;

export const prescribingTermRecordSchema = z.strictObject({
  termId: z.uuid(),
  kind: prescribingTermKindSchema,
  labelBn: z.string().nullable(),
  labelEn: z.string().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  version: z.number().int(),
});
export type PrescribingTermRecord = z.infer<typeof prescribingTermRecordSchema>;

export const prescribingTermListSchema = z.strictObject({
  terms: z.array(prescribingTermRecordSchema),
});
export type PrescribingTermList = z.infer<typeof prescribingTermListSchema>;

/** A term as a choice on a prescription line, and as the line keeps it once written. */
export const prescribingTermChoiceSchema = z.strictObject({
  termId: z.uuid(),
  labelBn: z.string().nullable(),
  labelEn: z.string().nullable(),
});
export type PrescribingTermChoice = z.infer<typeof prescribingTermChoiceSchema>;

/** The active terms of each kind, in picker order. */
export const prescribingTermChoicesSchema = z.strictObject({
  routes: z.array(prescribingTermChoiceSchema),
  frequencies: z.array(prescribingTermChoiceSchema),
  durations: z.array(prescribingTermChoiceSchema),
});
export type PrescribingTermChoices = z.infer<typeof prescribingTermChoicesSchema>;
