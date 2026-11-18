// The medicine dialog's form state and the request it sends (T-CLI-03; FR-CLI-004). Pure, so the
// rules are tested without rendering. Blank optional text is sent as null.
import type { MedicineRecord } from '@hms/contracts';
import { ApiError } from '../../api/errors';

export type MedicineForm = {
  brandName: string;
  genericName: string;
  strength: string;
  form: string;
  nameBn: string;
  manufacturer: string;
  active: boolean;
};

export function medicineFormOf(medicine?: MedicineRecord): MedicineForm {
  return {
    brandName: medicine?.brandName ?? '',
    genericName: medicine?.genericName ?? '',
    strength: medicine?.strength ?? '',
    form: medicine?.form ?? '',
    nameBn: medicine?.nameBn ?? '',
    manufacturer: medicine?.manufacturer ?? '',
    active: medicine?.active ?? true,
  };
}

const optional = (text: string) => (text.trim() === '' ? null : text.trim());

export function medicineFieldsOf(form: MedicineForm) {
  return {
    brandName: form.brandName.trim(),
    genericName: form.genericName.trim(),
    strength: optional(form.strength),
    form: form.form.trim(),
    nameBn: optional(form.nameBn),
    manufacturer: optional(form.manufacturer),
  };
}

/** Brand, generic name and form are required. */
export function isMedicineComplete(form: MedicineForm): boolean {
  const fields = medicineFieldsOf(form);
  return fields.brandName !== '' && fields.genericName !== '' && fields.form !== '';
}

/** True when saving would change the stored record. */
export function medicineDiffers(medicine: MedicineRecord, form: MedicineForm): boolean {
  const fields = medicineFieldsOf(form);
  return (
    form.active !== medicine.active ||
    (Object.keys(fields) as (keyof typeof fields)[]).some(
      (field) => fields[field] !== medicine[field],
    )
  );
}

/** How lists and prescriptions name a medicine: brand, then strength when it has one. */
export function medicineTitle(medicine: { brandName: string; strength: string | null }): string {
  return medicine.strength ? `${medicine.brandName} ${medicine.strength}` : medicine.brandName;
}

/** The API refused the entry: the hospital has this brand with the same strength and form. */
export function isDuplicateMedicine(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.code === 'VALIDATION_FAILED' &&
    (error.problem?.fields ?? []).some((field) => field.path === 'brandName')
  );
}
