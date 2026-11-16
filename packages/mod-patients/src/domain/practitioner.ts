// Practitioner values as stored (T-PRA-01, T-PRA-02, T-CLI-01; FR-PRA-001, FR-PRA-003): text
// tidied the same way as patient names, so equal entries compare equal, the department and staff
// account IDs as sent, and the list of fields an edit changed, for the audit event.
import { tidyText } from '@hms/domain-kernel';

/** The fields an administrator types, after tidying. */
export interface PractitionerValues {
  nameBn: string | null;
  nameEn: string | null;
  degrees: string | null;
  specialty: string | null;
  phone: string | null;
  registrationNo: string | null;
  /** An active department of the hospital, checked by the service (T-PRA-02 part 2). */
  departmentId: string | null;
  /** A linkable staff account of the hospital, checked by the service (T-CLI-01). */
  userId: string | null;
}

export type PractitionerInput = { [Field in keyof PractitionerValues]?: string | null };

export const PRACTITIONER_FIELDS = [
  'nameBn',
  'nameEn',
  'degrees',
  'specialty',
  'phone',
  'registrationNo',
  'departmentId',
  'userId',
] as const satisfies readonly (keyof PractitionerValues)[];

export function practitionerValuesOf(input: PractitionerInput): PractitionerValues {
  return {
    nameBn: tidyText(input.nameBn),
    nameEn: tidyText(input.nameEn),
    degrees: tidyText(input.degrees),
    specialty: tidyText(input.specialty),
    phone: tidyText(input.phone),
    registrationNo: tidyText(input.registrationNo),
    departmentId: input.departmentId ?? null,
    userId: input.userId ?? null,
  };
}

/** Names of the fields that differ, `active` included; empty when the edit changes nothing. */
export function changedPractitionerFields(
  stored: PractitionerValues & { active: boolean },
  next: PractitionerValues & { active: boolean },
): string[] {
  const changed: string[] = PRACTITIONER_FIELDS.filter((field) => stored[field] !== next[field]);
  if (stored.active !== next.active) changed.push('active');
  return changed;
}
