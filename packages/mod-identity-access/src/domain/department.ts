// Department values as stored (T-PRA-02; FR-CFG-001, FR-I18N-006): names tidied like every other
// master text, so equal entries compare equal, and the list of fields an edit changed, for the
// audit event. The code arrives upper case from the contract.
import { tidyText } from '@hms/domain-kernel';

export interface DepartmentValues {
  code: string;
  nameBn: string | null;
  nameEn: string | null;
}

export const DEPARTMENT_FIELDS = [
  'code',
  'nameBn',
  'nameEn',
] as const satisfies readonly (keyof DepartmentValues)[];

export function departmentValuesOf(input: {
  code: string;
  nameBn?: string | null | undefined;
  nameEn?: string | null | undefined;
}): DepartmentValues {
  return { code: input.code, nameBn: tidyText(input.nameBn), nameEn: tidyText(input.nameEn) };
}

/** Names of the fields that differ, `active` included; empty when the edit changes nothing. */
export function changedDepartmentFields(
  stored: DepartmentValues & { active: boolean },
  next: DepartmentValues & { active: boolean },
): string[] {
  const changed: string[] = DEPARTMENT_FIELDS.filter((field) => stored[field] !== next[field]);
  if (stored.active !== next.active) changed.push('active');
  return changed;
}
