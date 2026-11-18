// Catalogue value rules (T-CLI-03; FR-CLI-004, FR-I18N-006).
import { describe, expect, it } from 'vitest';
import { changedFields, medicineIdentityOf, medicineValuesOf, termValuesOf } from './catalogue.js';

describe('medicine values', () => {
  it('tidies text and turns blank optional text into null', () => {
    expect(
      medicineValuesOf({
        brandName: '  Napa  ',
        genericName: 'Paracetamol',
        strength: ' 500   mg ',
        form: 'Tablet',
        nameBn: '   ',
      }),
    ).toEqual({
      brandName: 'Napa',
      genericName: 'Paracetamol',
      strength: '500 mg',
      form: 'Tablet',
      nameBn: null,
      manufacturer: null,
    });
  });

  it('treats brand, strength and form in any letter case as the same medicine', () => {
    const base = { genericName: 'Paracetamol', form: 'Tablet' };
    const one = medicineValuesOf({ ...base, brandName: 'Napa', strength: '500 mg' });
    const two = medicineValuesOf({
      ...base,
      brandName: 'NAPA',
      strength: '500 MG',
      form: 'tablet',
    });
    const other = medicineValuesOf({ ...base, brandName: 'Napa', strength: '665 mg' });
    expect(medicineIdentityOf(one)).toBe(medicineIdentityOf(two));
    expect(medicineIdentityOf(one)).not.toBe(medicineIdentityOf(other));
  });
});

describe('changed fields', () => {
  it('lists the fields that differ, the active flag included', () => {
    const stored = { ...termValuesOf({ labelEn: 'Oral', sortOrder: 1 }), active: true };
    expect(changedFields(stored, { ...stored })).toEqual([]);
    expect(changedFields(stored, { ...stored, labelBn: 'Mukhe (bn)', active: false })).toEqual([
      'labelBn',
      'active',
    ]);
  });
});
