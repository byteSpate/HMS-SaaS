// Department master contracts (T-PRA-02; FR-CFG-001, FR-I18N-006; E section 4). A department has a
// short code, unique in the hospital, used in lists and prints (MED, OBG), and a name in Bangla
// and/or English. Each hospital has one facility today (C-024), so the facility is not sent.
import { z } from 'zod';

/** Upper case after trimming, so "med" and "MED" are the same code. */
const departmentCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9-]{0,19}$/, 'Use 1-20 letters, digits or hyphens, starting with a letter');

const departmentName = z.string().trim().min(1).max(100).nullable().optional();

const departmentFields = {
  code: departmentCode,
  nameBn: departmentName,
  nameEn: departmentName,
};

type DepartmentFields = z.infer<z.ZodObject<typeof departmentFields>>;

/** FR-I18N-006: a name in at least one script. */
function checkName(value: DepartmentFields, context: z.RefinementCtx): void {
  if (!value.nameBn && !value.nameEn) {
    context.addIssue({
      code: 'custom',
      path: ['nameEn'],
      message: 'Enter the name in Bangla or English',
    });
  }
}

export const createDepartmentRequestSchema = z
  .strictObject(departmentFields)
  .superRefine(checkName);
export type CreateDepartmentRequest = z.infer<typeof createDepartmentRequestSchema>;

/**
 * The whole record as the form shows it, with the version it was read at (SP-03). A name left
 * out or null is cleared. `active: false` takes the department out of selection lists without
 * deleting it, since practitioners, schedules and visits will point at it.
 */
export const updateDepartmentRequestSchema = z
  .strictObject({
    ...departmentFields,
    active: z.boolean(),
    expectedVersion: z.number().int().min(1),
  })
  .superRefine(checkName);
export type UpdateDepartmentRequest = z.infer<typeof updateDepartmentRequestSchema>;

export const departmentRecordSchema = z.strictObject({
  departmentId: z.uuid(),
  code: z.string(),
  nameBn: z.string().nullable(),
  nameEn: z.string().nullable(),
  active: z.boolean(),
  version: z.number().int(),
});
export type DepartmentRecord = z.infer<typeof departmentRecordSchema>;

export const departmentListSchema = z.strictObject({
  departments: z.array(departmentRecordSchema),
});
export type DepartmentList = z.infer<typeof departmentListSchema>;
