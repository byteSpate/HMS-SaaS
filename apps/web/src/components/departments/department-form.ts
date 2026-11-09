// The department dialog's form state and the request it sends (T-PRA-02; FR-CFG-001,
// FR-I18N-006). Pure, so the rules are tested without rendering. The code is shown and sent upper
// case, as the API stores it; a blank name is sent as null.
import type { DepartmentRecord } from '@hms/contracts';
import { ApiError } from '../../api/errors';

export type DepartmentForm = { code: string; nameBn: string; nameEn: string; active: boolean };

/** The same rule as the contract: 1-20 letters, digits or hyphens, starting with a letter. */
const CODE_PATTERN = /^[A-Z][A-Z0-9-]{0,19}$/;

export function formOf(department?: DepartmentRecord): DepartmentForm {
  return {
    code: department?.code ?? '',
    nameBn: department?.nameBn ?? '',
    nameEn: department?.nameEn ?? '',
    active: department?.active ?? true,
  };
}

export function fieldsOf(form: DepartmentForm) {
  const value = (text: string) => (text.trim() === '' ? null : text.trim());
  return {
    code: form.code.trim().toUpperCase(),
    nameBn: value(form.nameBn),
    nameEn: value(form.nameEn),
  };
}

export function hasValidCode(form: DepartmentForm): boolean {
  return CODE_PATTERN.test(fieldsOf(form).code);
}

/** FR-I18N-006: a name in Bangla or English. */
export function hasName(form: DepartmentForm): boolean {
  const fields = fieldsOf(form);
  return fields.nameBn !== null || fields.nameEn !== null;
}

/** True when saving would change the stored record. */
export function differsFrom(department: DepartmentRecord, form: DepartmentForm): boolean {
  const fields = fieldsOf(form);
  return (
    form.active !== department.active ||
    fields.code !== department.code ||
    fields.nameBn !== department.nameBn ||
    fields.nameEn !== department.nameEn
  );
}

/**
 * What to say under the code field: the API's "already used" after a save, else a typed code that
 * breaks the rule. Nothing for an empty field, which only keeps the save button disabled.
 */
export function codeProblem(
  form: DepartmentForm,
  saveError: unknown,
): 'codeTaken' | 'codeInvalid' | null {
  if (isCodeTaken(saveError)) return 'codeTaken';
  if (form.code.trim() !== '' && !hasValidCode(form)) return 'codeInvalid';
  return null;
}

/** The API refused the code because another department of the hospital has it. */
export function isCodeTaken(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code === 'VALIDATION_FAILED' &&
    (error.problem?.fields ?? []).some((field) => field.path === 'code')
  );
}
