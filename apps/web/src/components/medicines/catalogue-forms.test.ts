// Medicine and prescribing term form rules (T-CLI-03; FR-CLI-004, FR-I18N-006).
import type { MedicineRecord, PrescribingTermRecord } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import {
  isDuplicateMedicine,
  isMedicineComplete,
  medicineDiffers,
  medicineFieldsOf,
  medicineFormOf,
} from './medicine-form';
import { isTermComplete, sortOrderOf, termDiffers, termFormOf, termsOfKind } from './term-form';

const medicine: MedicineRecord = {
  medicineId: '0199e0b0-0000-7000-8000-000000000701',
  brandName: 'Napa',
  genericName: 'Paracetamol',
  strength: '500 mg',
  form: 'Tablet',
  nameBn: null,
  manufacturer: null,
  active: true,
  version: 1,
};

const term = (patch: Partial<PrescribingTermRecord>): PrescribingTermRecord => ({
  termId: '0199e0b0-0000-7000-8000-000000000801',
  kind: 'FREQUENCY',
  labelBn: null,
  labelEn: 'Once daily',
  sortOrder: 0,
  active: true,
  version: 1,
  ...patch,
});

describe('medicine form', () => {
  it('sends blank optional text as null and needs brand, generic name and form', () => {
    const form = { ...medicineFormOf(), brandName: ' Napa ', genericName: 'Paracetamol' };
    expect(isMedicineComplete(form)).toBe(false);
    const complete = { ...form, form: 'Tablet', strength: '  ' };
    expect(isMedicineComplete(complete)).toBe(true);
    expect(medicineFieldsOf(complete)).toMatchObject({ brandName: 'Napa', strength: null });
  });

  it('knows when an edit changes nothing', () => {
    const form = medicineFormOf(medicine);
    expect(medicineDiffers(medicine, form)).toBe(false);
    expect(medicineDiffers(medicine, { ...form, manufacturer: 'Example Pharma' })).toBe(true);
    expect(medicineDiffers(medicine, { ...form, active: false })).toBe(true);
  });

  it('reads the duplicate answer from the brand field', () => {
    const duplicate = new ApiError('VALIDATION_FAILED', 422, {
      type: 'urn:hms:error:VALIDATION_FAILED',
      title: 'Request body is invalid',
      status: 422,
      code: 'VALIDATION_FAILED',
      fields: [{ path: 'brandName', message: 'duplicate' }],
    });
    expect(isDuplicateMedicine(duplicate)).toBe(true);
    expect(isDuplicateMedicine(new Error('network'))).toBe(false);
  });
});

describe('prescribing term form', () => {
  it('needs a label in one script and an order of 0-9999', () => {
    expect(isTermComplete(termFormOf())).toBe(false);
    expect(isTermComplete({ ...termFormOf(), labelEn: 'Oral' })).toBe(true);
    expect(sortOrderOf({ ...termFormOf(), sortOrder: '12' })).toBe(12);
    expect(sortOrderOf({ ...termFormOf(), sortOrder: '-1' })).toBeNull();
    expect(isTermComplete({ ...termFormOf(), labelEn: 'Oral', sortOrder: '1.5' })).toBe(false);
  });

  it('knows when an edit changes nothing', () => {
    const stored = term({});
    expect(termDiffers(stored, termFormOf(stored))).toBe(false);
    expect(termDiffers(stored, { ...termFormOf(stored), sortOrder: '3' })).toBe(true);
  });

  it('lists one kind, active first, then in picker order', () => {
    const terms = [
      term({ termId: 'a', labelEn: 'Twice daily', sortOrder: 2 }),
      term({ termId: 'b', labelEn: 'Once daily', sortOrder: 1 }),
      term({ termId: 'c', labelEn: 'Hourly', sortOrder: 0, active: false }),
      term({ termId: 'd', kind: 'ROUTE', labelEn: 'Oral' }),
    ];
    expect(termsOfKind(terms, 'FREQUENCY').map((row) => row.termId)).toEqual(['b', 'a', 'c']);
  });
});
