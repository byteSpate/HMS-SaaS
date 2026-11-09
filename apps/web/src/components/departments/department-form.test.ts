import type { DepartmentRecord } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import {
  codeProblem,
  differsFrom,
  fieldsOf,
  formOf,
  hasName,
  hasValidCode,
  isCodeTaken,
} from './department-form';

// The department dialog's form rules (T-PRA-02; FR-CFG-001, FR-I18N-006). Names are synthetic.
const medicine: DepartmentRecord = {
  departmentId: '0199e0b0-0000-7000-8000-000000000601',
  code: 'MED',
  nameBn: null,
  nameEn: 'Medicine',
  active: true,
  version: 2,
};

describe('department form', () => {
  it('starts empty and active for a new department', () => {
    expect(formOf()).toEqual({ code: '', nameBn: '', nameEn: '', active: true });
  });

  it('sends the code upper case and a blank name as null', () => {
    expect(fieldsOf({ ...formOf(), code: ' obg ', nameEn: ' Gynaecology ', nameBn: '  ' })).toEqual(
      { code: 'OBG', nameEn: 'Gynaecology', nameBn: null },
    );
  });

  it('needs a code of letters, digits or hyphens and a name in either script', () => {
    expect(hasValidCode({ ...formOf(), code: 'ent' })).toBe(true);
    expect(hasValidCode({ ...formOf(), code: '1MED' })).toBe(false);
    expect(hasValidCode({ ...formOf(), code: 'MED SURG' })).toBe(false);
    expect(hasName(formOf())).toBe(false);
    expect(hasName({ ...formOf(), nameBn: 'x' })).toBe(true);
  });

  it('sees a change only when the saved record would differ', () => {
    expect(differsFrom(medicine, formOf(medicine))).toBe(false);
    expect(differsFrom(medicine, { ...formOf(medicine), code: 'med' })).toBe(false);
    expect(differsFrom(medicine, { ...formOf(medicine), active: false })).toBe(true);
    expect(differsFrom(medicine, { ...formOf(medicine), nameBn: 'x' })).toBe(true);
  });

  it('recognises the answer for a code already in use', () => {
    const problem = {
      type: 'urn:hms:error:VALIDATION_FAILED',
      title: 'Request body is invalid',
      status: 422,
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'code', message: 'taken' }],
    };
    expect(isCodeTaken(new ApiError('VALIDATION_FAILED', 422, problem as never))).toBe(true);
    expect(isCodeTaken(new ApiError('STALE_RECORD', 409))).toBe(false);
    const taken = new ApiError('VALIDATION_FAILED', 422, problem as never);
    expect(codeProblem({ ...formOf(), code: 'MED' }, taken)).toBe('codeTaken');
    expect(codeProblem({ ...formOf(), code: '1MED' }, null)).toBe('codeInvalid');
    expect(codeProblem(formOf(), null)).toBeNull();
  });
});
