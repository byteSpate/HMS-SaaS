// Prescription contracts (T-CLI-03; FR-CLI-001, FR-CLI-004..006; UC-CLI-01 steps 4 and 5;
// UC-CLI-02; C-012, C-029, FPR-06; Q-067 interim: catalogue-based lines with free-text
// instructions, vocabularies entered by the hospital). The prescription of a consultation is a
// clinical document like the note: the doctor's draft autosaves, signing makes an immutable
// version, and an amendment with a reason signs as the next version. Each line keeps a copy of
// the medicine and the labels it was written with, so a later catalogue edit never changes it.
import { z } from 'zod';
import { medicineChoiceSchema, prescribingTermChoiceSchema } from './medicines.js';
import { printLanguageSchema } from './payments.js';

/** FR-CLI-006: the hospital pharmacy supplies it, or the patient buys it outside. */
export const FULFILMENTS = ['HOSPITAL_PHARMACY', 'EXTERNAL'] as const;
export const fulfilmentSchema = z.enum(FULFILMENTS);
export type Fulfilment = z.infer<typeof fulfilmentSchema>;

export const PRESCRIPTION_LINES_MAX = 30;

const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable();

/** One line as the doctor writes it: catalogue and list IDs plus free text. */
export const prescriptionLineInputSchema = z.strictObject({
  /** Chosen by the screen, so a line keeps its identity while the draft is edited. */
  lineId: z.uuid(),
  medicineId: z.uuid(),
  /** Free text, for example "1 tablet" or "5 ml" (Q-067). */
  dose: optionalText(60),
  routeTermId: z.uuid().nullable(),
  frequencyTermId: z.uuid().nullable(),
  durationTermId: z.uuid().nullable(),
  instructionsBn: optionalText(300),
  instructionsEn: optionalText(300),
  quantity: z.number().int().min(1).max(9999).nullable(),
  fulfilment: fulfilmentSchema,
  /** FR-CLI-006: for example "patient already has it at home". */
  patientNote: optionalText(200),
});
export type PrescriptionLineInput = z.infer<typeof prescriptionLineInputSchema>;

/** A line as stored: the input plus the medicine and labels as they were when written. */
export const prescriptionLineSchema = prescriptionLineInputSchema.extend({
  medicine: medicineChoiceSchema,
  route: prescribingTermChoiceSchema.nullable(),
  frequency: prescribingTermChoiceSchema.nullable(),
  duration: prescribingTermChoiceSchema.nullable(),
});
export type PrescriptionLine = z.infer<typeof prescriptionLineSchema>;

export const prescriptionContentSchema = z.strictObject({
  lines: z.array(prescriptionLineSchema).max(PRESCRIPTION_LINES_MAX),
});
export type PrescriptionContent = z.infer<typeof prescriptionContentSchema>;

/** The prescription's version the screen holds (SP-03); 0 while there is none yet. */
export const savePrescriptionDraftRequestSchema = z.strictObject({
  lines: z.array(prescriptionLineInputSchema).max(PRESCRIPTION_LINES_MAX),
  expectedVersion: z.number().int().min(0),
});
export type SavePrescriptionDraftRequest = z.infer<typeof savePrescriptionDraftRequestSchema>;

export const prescriptionVersionRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
});
export type PrescriptionVersionRequest = z.infer<typeof prescriptionVersionRequestSchema>;

/** UC-CLI-02: the reason is mandatory. */
export const amendPrescriptionRequestSchema = z.strictObject({
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().min(1),
});
export type AmendPrescriptionRequest = z.infer<typeof amendPrescriptionRequestSchema>;

export const signedPrescriptionVersionSchema = z.strictObject({
  versionNo: z.number().int().min(1),
  content: prescriptionContentSchema,
  signedAt: z.iso.datetime(),
  /** The signing doctor's display name. */
  signedBy: z.string(),
  /** Null for v1; the amendment's reason for later versions. */
  amendReason: z.string().nullable(),
});
export type SignedPrescriptionVersion = z.infer<typeof signedPrescriptionVersionSchema>;

export const prescriptionStatusSchema = z.enum(['NONE', 'DRAFT', 'SIGNED']);
export type PrescriptionStatus = z.infer<typeof prescriptionStatusSchema>;

export const prescriptionSchema = z.strictObject({
  consultationId: z.uuid(),
  /** NONE: nothing written yet; DRAFT: an unsigned draft (first or amendment); SIGNED. */
  status: prescriptionStatusSchema,
  draft: prescriptionContentSchema.nullable(),
  draftSavedAt: z.iso.datetime().nullable(),
  /** Set while an amendment is being drafted. */
  amendReason: z.string().nullable(),
  /** Signed versions, newest first. */
  versions: z.array(signedPrescriptionVersionSchema),
  /** The prescription's version for the next command; 0 while there is none. */
  version: z.number().int().min(0),
});
export type Prescription = z.infer<typeof prescriptionSchema>;

/** FR-CLI-005: print the latest signed version in a language; printing changes nothing. */
export const printPrescriptionRequestSchema = z.strictObject({ language: printLanguageSchema });
export type PrintPrescriptionRequest = z.infer<typeof printPrescriptionRequestSchema>;

export const prescriptionPrintSchema = z.strictObject({
  versionNo: z.number().int().min(1),
  html: z.string(),
});
export type PrescriptionPrint = z.infer<typeof prescriptionPrintSchema>;
