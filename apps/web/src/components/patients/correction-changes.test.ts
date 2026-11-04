import type { PatientDetail } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { changesOf, formOf } from './correction-changes';

// What a correction sends (T-PAT-04): only what differs from the record.
const patient: PatientDetail = {
  patientId: '0199e0b0-0000-7000-8000-000000000001',
  mrn: 'MRN-000001',
  identityStatus: 'CONFIRMED',
  nameBn: null,
  nameEn: 'Karim Ahmed',
  sex: 'MALE',
  ageYears: 36,
  ageEstimated: false,
  phone: '01700000001',
  nidLast4: '7890',
  birthDate: '1990-05-14',
  birthDatePrecision: 'EXACT',
  reportedAgeYears: null,
  reportedAgeOn: null,
  addressText: null,
  version: 3,
};

describe('changesOf', () => {
  it('sends nothing for an untouched form', () => {
    expect(changesOf(patient, formOf(patient))).toEqual({});
  });

  it('sends only the changed fields, null to clear, and an age instead of the date', () => {
    const form = { ...formOf(patient), nameEn: ' Karim  Uddin ', age: '40', noPhone: true };
    expect(changesOf(patient, form)).toEqual({
      nameEn: 'Karim  Uddin',
      reportedAgeYears: 40,
      phone: null,
    });
  });

  it('sends a typed NID and a new address', () => {
    const form = { ...formOf(patient), nid: '123 456 7890', address: 'Mirpur 10' };
    expect(changesOf(patient, form)).toEqual({ nid: '123 456 7890', addressText: 'Mirpur 10' });
  });
});
