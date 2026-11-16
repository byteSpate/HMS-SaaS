// The practitioner dialog's form state and the request it sends (T-PRA-01; FR-PRA-001). Pure, so
// the rules are tested without rendering: every field is text in the form, and a blank field is
// sent as null, which the API stores as "not recorded". The department (T-PRA-02) is chosen from
// the hospital's active departments; an empty choice is none. So is the staff account (T-CLI-01;
// FR-PRA-003), which shows the doctor their own worklist.
import type { DepartmentChoice, Practitioner, StaffAccountChoice } from '@hms/contracts';

export const PRACTITIONER_TEXT_FIELDS = [
  'nameBn',
  'nameEn',
  'degrees',
  'specialty',
  'phone',
  'registrationNo',
] as const;

export type PractitionerTextField = (typeof PRACTITIONER_TEXT_FIELDS)[number];

export type PractitionerForm = Record<PractitionerTextField, string> & {
  departmentId: string;
  userId: string;
  active: boolean;
};

/** The form for a new practitioner, or prefilled with an existing one. */
export function formOf(practitioner?: Practitioner): PractitionerForm {
  return {
    nameBn: practitioner?.nameBn ?? '',
    nameEn: practitioner?.nameEn ?? '',
    degrees: practitioner?.degrees ?? '',
    specialty: practitioner?.specialty ?? '',
    phone: practitioner?.phone ?? '',
    registrationNo: practitioner?.registrationNo ?? '',
    departmentId: practitioner?.department?.departmentId ?? '',
    userId: practitioner?.account?.userId ?? '',
    active: practitioner?.active ?? true,
  };
}

export type PractitionerFields = Record<PractitionerTextField, string | null> & {
  departmentId: string | null;
  userId: string | null;
};

export function fieldsOf(form: PractitionerForm): PractitionerFields {
  const value = (text: string) => (text.trim() === '' ? null : text.trim());
  return {
    nameBn: value(form.nameBn),
    nameEn: value(form.nameEn),
    degrees: value(form.degrees),
    specialty: value(form.specialty),
    phone: value(form.phone),
    registrationNo: value(form.registrationNo),
    departmentId: form.departmentId === '' ? null : form.departmentId,
    userId: form.userId === '' ? null : form.userId,
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
    fields.departmentId !== (practitioner.department?.departmentId ?? null) ||
    fields.userId !== (practitioner.account?.userId ?? null) ||
    PRACTITIONER_TEXT_FIELDS.some((field) => fields[field] !== practitioner[field])
  );
}

/** The name to show: English first for a list sorted by it, else the Bangla one. */
export function practitionerName(practitioner: Pick<Practitioner, 'nameBn' | 'nameEn'>): string {
  return practitioner.nameEn ?? practitioner.nameBn ?? '';
}

/** How a department reads in a list: its code, then its English name, else its Bangla one. */
export function departmentLabel(department: DepartmentChoice): string {
  const name = department.nameEn ?? department.nameBn;
  return name ? `${department.code} - ${name}` : department.code;
}

/**
 * The department picker's options: none first, then the active departments. A practitioner's
 * department that was deactivated after it was chosen is kept, so an edit does not drop it.
 */
export function departmentOptions(
  choices: readonly DepartmentChoice[],
  current: DepartmentChoice | null,
  noneLabel: string,
): { value: string; label: string }[] {
  const listed =
    current && !choices.some((choice) => choice.departmentId === current.departmentId)
      ? [...choices, current]
      : choices;
  return [
    { value: '', label: noneLabel },
    ...listed.map((choice) => ({ value: choice.departmentId, label: departmentLabel(choice) })),
  ];
}

/** How an account reads in a list: the person's name and the username they sign in with. */
export function accountLabel(account: StaffAccountChoice): string {
  return `${account.displayName} (${account.username})`;
}

/**
 * The account picker's options: none first, then the linkable accounts. A linked account that was
 * suspended after it was linked is kept, so an edit does not drop it.
 */
export function accountOptions(
  choices: readonly StaffAccountChoice[],
  current: StaffAccountChoice | null,
  noneLabel: string,
): { value: string; label: string }[] {
  const listed =
    current && !choices.some((choice) => choice.userId === current.userId)
      ? [...choices, current]
      : choices;
  return [
    { value: '', label: noneLabel },
    ...listed.map((choice) => ({ value: choice.userId, label: accountLabel(choice) })),
  ];
}
