// The banner view of a patient (T-PAT-02, T-PAT-04; FR-PAT-010, FR-PAT-007), shared by search and
// the patient detail: names as entered, the age on the hospital's date, the NID masked.
import type { PatientSummary } from '@hms/contracts';
import { ageOn } from '../domain/age.js';
import type { PatientRow } from '../infrastructure/patient-search.repository.js';

export function summaryOf(row: PatientRow, today: string): PatientSummary {
  const age = ageOn(row, today);
  return {
    patientId: row.id,
    mrn: row.mrn,
    identityStatus: row.identityStatus as PatientSummary['identityStatus'],
    nameBn: row.nameBn,
    nameEn: row.nameEn,
    sex: row.sex as PatientSummary['sex'],
    ageYears: age?.years ?? null,
    ageEstimated: age?.estimated ?? false,
    phone: row.phoneNormalized,
    nidLast4: row.nidLast4,
  };
}
