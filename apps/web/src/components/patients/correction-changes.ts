// What an identity correction sends (T-PAT-04; FR-PAT-008): only the fields that differ from the
// record, so the history and the audit name exactly what was corrected. Pure, for unit tests.
import type { PatientDetail, PatientIdentityChanges, PatientSex } from '@hms/contracts';

const AGE = /^\d{1,3}$/;

export interface CorrectionForm {
  nameBn: string;
  nameEn: string;
  sex: PatientSex;
  birthDate: string;
  age: string;
  phone: string;
  noPhone: boolean;
  nid: string;
  address: string;
}

export function formOf(patient: PatientDetail): CorrectionForm {
  return {
    nameBn: patient.nameBn ?? '',
    nameEn: patient.nameEn ?? '',
    sex: patient.sex,
    birthDate: patient.birthDate ?? '',
    age: '',
    phone: patient.phone ?? '',
    noPhone: patient.phone === null,
    nid: '',
    address: patient.addressText ?? '',
  };
}

const orNull = (value: string) => value.trim() || null;

/** Only the fields that differ from the record; the API checks them again. */
export function changesOf(patient: PatientDetail, form: CorrectionForm): PatientIdentityChanges {
  const changes: PatientIdentityChanges = {};
  if (orNull(form.nameBn) !== patient.nameBn) changes.nameBn = orNull(form.nameBn);
  if (orNull(form.nameEn) !== patient.nameEn) changes.nameEn = orNull(form.nameEn);
  if (form.sex !== patient.sex) changes.sex = form.sex;
  if (AGE.test(form.age.trim())) changes.reportedAgeYears = Number(form.age.trim());
  else if (form.birthDate && form.birthDate !== patient.birthDate)
    changes.birthDate = form.birthDate;
  const phone = form.noPhone ? null : orNull(form.phone);
  if (phone !== patient.phone) changes.phone = phone;
  if (orNull(form.address) !== patient.addressText) changes.addressText = orNull(form.address);
  if (form.nid.trim()) changes.nid = form.nid.trim();
  return changes;
}
