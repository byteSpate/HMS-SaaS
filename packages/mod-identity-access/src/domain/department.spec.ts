import { describe, expect, it } from 'vitest';
import { changedDepartmentFields, departmentValuesOf } from './department.js';

// Department values (T-PRA-02; FR-CFG-001). Names are synthetic (AS-009).
describe('department values', () => {
  it('tidies the names and stores a blank one as not recorded', () => {
    expect(
      departmentValuesOf({ code: 'MED', nameEn: '  Internal   medicine ', nameBn: ' ' }),
    ).toEqual({ code: 'MED', nameEn: 'Internal medicine', nameBn: null });
  });

  it('lists the changed fields, active included, and nothing for an unchanged record', () => {
    const stored = { ...departmentValuesOf({ code: 'MED', nameEn: 'Medicine' }), active: true };
    expect(changedDepartmentFields(stored, { ...stored })).toEqual([]);
    expect(changedDepartmentFields(stored, { ...stored, code: 'IM', active: false })).toEqual([
      'code',
      'active',
    ]);
  });
});
