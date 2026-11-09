// Practitioner master contracts (T-PRA-01; FR-PRA-001..003; E section 5.1). A practitioner is a
// professional identity: names in Bangla and English, degrees, specialty, contact and an optional
// registration number. Two practitioners may share a name; these fields tell them apart. The
// department and the link to a user account come later (owner decision 2026-11-08, option A).
import { z } from 'zod';

const shortText = (max: number) => z.string().trim().min(1).max(max);

/** Every field the administrator types. Absent or null means "not recorded". */
const practitionerFields = {
  nameBn: shortText(200).nullable().optional(),
  nameEn: shortText(200).nullable().optional(),
  degrees: shortText(300).nullable().optional(),
  specialty: shortText(200).nullable().optional(),
  phone: shortText(30).nullable().optional(),
  registrationNo: shortText(50).nullable().optional(),
};

type PractitionerFields = z.infer<z.ZodObject<typeof practitionerFields>>;

/** FR-PRA-001: a name in at least one script. */
function checkName(value: PractitionerFields, context: z.RefinementCtx): void {
  if (!value.nameBn && !value.nameEn) {
    context.addIssue({
      code: 'custom',
      path: ['nameEn'],
      message: 'Enter the name in Bangla or English',
    });
  }
}

export const createPractitionerRequestSchema = z
  .strictObject(practitionerFields)
  .superRefine(checkName);
export type CreatePractitionerRequest = z.infer<typeof createPractitionerRequestSchema>;

/**
 * The whole record as the form shows it, with the version it was read at (SP-03). A field left
 * out or null is cleared. `active: false` takes the practitioner out of selection lists without
 * deleting them, since visits and fees will point at the record.
 */
export const updatePractitionerRequestSchema = z
  .strictObject({
    ...practitionerFields,
    active: z.boolean(),
    expectedVersion: z.number().int().min(1),
  })
  .superRefine(checkName);
export type UpdatePractitionerRequest = z.infer<typeof updatePractitionerRequestSchema>;

export const practitionerSchema = z.strictObject({
  practitionerId: z.uuid(),
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
  degrees: z.string().nullable(),
  specialty: z.string().nullable(),
  phone: z.string().nullable(),
  registrationNo: z.string().nullable(),
  active: z.boolean(),
  version: z.number().int(),
});
export type Practitioner = z.infer<typeof practitionerSchema>;

export const practitionerListSchema = z.strictObject({
  practitioners: z.array(practitionerSchema),
});
export type PractitionerList = z.infer<typeof practitionerListSchema>;
