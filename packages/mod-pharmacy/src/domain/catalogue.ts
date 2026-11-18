// Catalogue values as stored (T-CLI-03; FR-CLI-004, FR-PHA-011 subset; FR-I18N-006): text tidied
// like every other master (NFC, single spaces), so the same entry typed twice compares equal, and
// the list of fields an edit changed, for the audit event.
import { tidyText } from '@hms/domain-kernel';

export interface MedicineValues {
  brandName: string;
  genericName: string;
  strength: string | null;
  form: string;
  nameBn: string | null;
  manufacturer: string | null;
}

export interface TermValues {
  labelBn: string | null;
  labelEn: string | null;
  sortOrder: number;
}

/** The contract has already refused blank required text; this only narrows the type. */
function required(value: string): string {
  return tidyText(value) ?? value;
}

export function medicineValuesOf(input: {
  brandName: string;
  genericName: string;
  strength?: string | null;
  form: string;
  nameBn?: string | null;
  manufacturer?: string | null;
}): MedicineValues {
  return {
    brandName: required(input.brandName),
    genericName: required(input.genericName),
    strength: tidyText(input.strength),
    form: required(input.form),
    nameBn: tidyText(input.nameBn),
    manufacturer: tidyText(input.manufacturer),
  };
}

export function termValuesOf(input: {
  labelBn?: string | null;
  labelEn?: string | null;
  sortOrder: number;
}): TermValues {
  return {
    labelBn: tidyText(input.labelBn),
    labelEn: tidyText(input.labelEn),
    sortOrder: input.sortOrder,
  };
}

/**
 * Names of the edited fields whose stored value differs (`active` included); empty when the edit
 * changes nothing. The stored record may carry more fields (ID, version); only the edited ones
 * are compared.
 */
export function changedFields<T extends object>(
  stored: Readonly<Record<keyof T, unknown>>,
  next: T,
): string[] {
  return (Object.keys(next) as (keyof T & string)[]).filter(
    (field) => stored[field] !== next[field],
  );
}

/**
 * The identity of a medicine in a hospital: brand, strength and form, whatever the letter case
 * (the medicine_identity_key index). Two entries with the same key are the same medicine.
 */
export function medicineIdentityOf(values: MedicineValues): string {
  return [values.brandName, values.strength ?? '', values.form]
    .map((part) => part.toLowerCase())
    .join('|');
}
