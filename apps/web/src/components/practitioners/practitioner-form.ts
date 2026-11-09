// The practitioner dialog's form state and the request it sends (T-PRA-01; FR-PRA-001). Pure, so
// the rules are tested without rendering: every field is text in the form, and a blank field is
// sent as null, which the API stores as "not recorded".
import type { Practitioner } from '@hms/contracts';

export const PRACTITIONER_TEXT_FIELDS = [
  'nameBn',
  'nameEn',
  'degrees',
  'specialty',
  'phone',
  'registrationNo',
] as const;

export type PractitionerTextField = (typeof PRACTITIONER_TEXT_FIELDS)[number];

export type PractitionerForm = Record<PractitionerTextField, string> & { active: boolean };

/** The form for a new practitioner, or prefilled with an existing one. */
export function formOf(practitioner?: Practitioner): PractitionerForm {
  return {
    nameBn: practitioner?.nameBn ?? '',
    nameEn: practitioner?.nameEn ?? '',
    degrees: practitioner?.degrees ?? '',
    specialty: practitioner?.specialty ?? '',
    phone: practitioner?.phone ?? '',
    registrationNo: practitioner?.registrationNo ?? '',
    active: practitioner?.active ?? true,
  };
}

export type PractitionerFields = Record<PractitionerTextField, string | null>;

export function fieldsOf(form: PractitionerForm): PractitionerFields {
  const value = (text: string) => (text.trim() === '' ? null : text.trim());
  return {
    nameBn: value(form.nameBn),
    nameEn: value(form.nameEn),
    degrees: value(form.degrees),
    specialty: value(form.specialty),
    phone: value(form.phone),
    registrationNo: value(form.registrationNo),
  };
}

/** FR-PRA-001: a name in Bangla or English. */
export function hasName(form: PractitionerForm): boolean {
  const fields = fieldsOf(form);
  return fields.nameBn !== null || fields.nameEn !== null;
}

/** True when saving would change the stored record. */
export function differsFrom(practitioner: Practitioner, form: PractitionerForm): boolean {
  const fields = fieldsOf(form);
  return (
    form.active !== practitioner.active ||
    PRACTITIONER_TEXT_FIELDS.some((field) => fields[field] !== practitioner[field])
  );
}

/** The name to show: English first for a list sorted by it, else the Bangla one. */
export function practitionerName(practitioner: Pick<Practitioner, 'nameBn' | 'nameEn'>): string {
  return practitioner.nameEn ?? practitioner.nameBn ?? '';
}
