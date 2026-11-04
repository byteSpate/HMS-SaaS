// Patient registration contracts (T-PAT-01; FR-PAT-001, -002, -005, -006, -009, -011; C-034).
// Shape rules live here so the web form and the API agree. Rules that need the hospital's date or
// the phone normalization (a birth date in the future, a mobile number's format) are checked by the
// patients module and come back as VALIDATION_FAILED with the same field paths.
import { z } from 'zod';

export const patientSexes = ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'] as const;
export const patientSexSchema = z.enum(patientSexes);
export type PatientSex = z.infer<typeof patientSexSchema>;

export const birthDatePrecisions = ['EXACT', 'YEAR_ESTIMATED', 'UNKNOWN'] as const;

const personName = z.string().trim().min(1).max(200);

/** C-034: name, sex, age or birth date, and the mobile number, which is null when there is none. */
const identityFields = {
  nameBn: personName.optional(),
  nameEn: personName.optional(),
  sex: patientSexSchema,
  birthDate: z.iso.date().optional(),
  reportedAgeYears: z.number().int().min(0).max(150).optional(),
  phone: z.string().trim().min(1).max(30).nullable(),
};

const identityObject = z.object(identityFields);

/** The identity part of a registration or a candidate lookup. */
export type PatientIdentityInput = z.infer<typeof identityObject>;

/** FR-PAT-005 and FR-PAT-006: at least one name, and exactly one of birth date or age. */
function checkIdentity(value: PatientIdentityInput, context: z.RefinementCtx): void {
  if (value.nameBn === undefined && value.nameEn === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['nameEn'],
      message: 'Enter the name in Bangla or English',
    });
  }
  if (value.birthDate !== undefined && value.reportedAgeYears !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['reportedAgeYears'],
      message: 'Give the birth date or the age, not both',
    });
  }
  if (value.birthDate === undefined && value.reportedAgeYears === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['birthDate'],
      message: 'Enter the birth date or the age',
    });
  }
}

/** Unknown keys are dropped, so the form can send its whole state while the receptionist types. */
export const duplicateCandidatesRequestSchema = identityObject.superRefine(checkIdentity);
export type DuplicateCandidatesRequest = z.infer<typeof duplicateCandidatesRequestSchema>;

export const registerPatientRequestSchema = z
  .strictObject({
    ...identityFields,
    addressText: z.string().trim().min(1).max(500).optional(),
    /** FR-PAT-001: the receptionist saw these candidates and still registers a new patient. */
    confirmNewDespiteCandidates: z.boolean(),
    shownCandidateIds: z.array(z.uuid()).max(20),
  })
  .superRefine(checkIdentity);
export type RegisterPatientRequest = z.infer<typeof registerPatientRequestSchema>;

/** FR-PAT-011: each candidate says why it matched. */
export const candidateReasons = ['SAME_PHONE', 'SIMILAR_NAME'] as const;

export const duplicateCandidateSchema = z.object({
  patientId: z.uuid(),
  mrn: z.string(),
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
  sex: patientSexSchema,
  birthYear: z.number().int().nullable(),
  birthDatePrecision: z.enum(birthDatePrecisions),
  /** The last four digits only, so the list does not show whole numbers. */
  phoneLast4: z.string().nullable(),
  reasons: z.array(z.enum(candidateReasons)).min(1),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const duplicateCandidatesResponseSchema = z.object({
  candidates: z.array(duplicateCandidateSchema),
});
export type DuplicateCandidatesResponse = z.infer<typeof duplicateCandidatesResponseSchema>;

export const registeredPatientSchema = z.object({
  patientId: z.uuid(),
  mrn: z.string(),
  version: z.number().int().positive(),
});
export type RegisteredPatient = z.infer<typeof registeredPatientSchema>;

/** `reason` of a VALIDATION_FAILED problem when candidates were not confirmed (FR-PAT-001). */
export const DUPLICATE_CANDIDATES_PRESENT = 'DUPLICATE_CANDIDATES_PRESENT';

/** T-PAT-02 (UC-PAT-01 step 1): one box for an MRN, a phone number or a name. */
export const patientSearchRequestSchema = z.strictObject({
  term: z.string().trim().min(1).max(100),
});
export type PatientSearchRequest = z.infer<typeof patientSearchRequestSchema>;

/** The banner fields of a patient (FR-PAT-010), as listed by search. */
export const patientSummarySchema = z.object({
  patientId: z.uuid(),
  mrn: z.string(),
  identityStatus: z.enum(['CONFIRMED', 'TEMPORARY']),
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
  sex: patientSexSchema,
  /** Whole years on the hospital's date; null when unknown. */
  ageYears: z.number().int().nullable(),
  /** True when the age comes from a reported age (FR-PAT-006). */
  ageEstimated: z.boolean(),
  phone: z.string().nullable(),
});
export type PatientSummary = z.infer<typeof patientSummarySchema>;

export const patientSearchResponseSchema = z.object({
  /** How the term was read, so the screen can say "Matched by phone". */
  matchedBy: z.enum(['MRN', 'PHONE', 'NAME']),
  patients: z.array(patientSummarySchema),
});
export type PatientSearchResponse = z.infer<typeof patientSearchResponseSchema>;
