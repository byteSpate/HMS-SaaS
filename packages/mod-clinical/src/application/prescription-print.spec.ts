// The printed prescription's data (T-CLI-03; FR-CLI-005, FR-CLI-007; UC-CLI-02).
import type { NoteContent, PrescriptionLine } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { prescriptionPrintDataOf, type PrintSources } from './prescription-print.js';

const line: PrescriptionLine = {
  lineId: '0199e0b0-0000-7000-8000-000000000901',
  medicineId: '0199e0b0-0000-7000-8000-000000000701',
  medicine: {
    medicineId: '0199e0b0-0000-7000-8000-000000000701',
    brandName: 'Napa',
    genericName: 'Paracetamol',
    strength: null,
    form: 'Syrup',
    nameBn: null,
  },
  dose: '5 ml',
  routeTermId: null,
  frequencyTermId: null,
  durationTermId: null,
  route: null,
  frequency: null,
  duration: null,
  instructionsBn: null,
  instructionsEn: 'At night',
  quantity: null,
  fulfilment: 'EXTERNAL',
  patientNote: null,
};

const note: NoteContent = {
  complaint: 'Fever',
  history: null,
  examination: null,
  assessment: null,
  advice: 'Rest at home',
  allergies: { status: 'NO_KNOWN_ALLERGIES' },
};

const sources = (patch: Partial<PrintSources> = {}): PrintSources => ({
  hospital: { nameEn: 'Example General Hospital' },
  doctor: {
    nameEn: 'Dr Karim',
    nameBn: null,
    degrees: 'MBBS',
    specialty: null,
    registrationNo: null,
  },
  patient: { nameEn: 'Salma Begum', nameBn: null, mrn: 'MRN-1' },
  version: {
    versionNo: 1,
    content: { lines: [line] },
    signedAt: new Date('2026-11-18T05:00:00Z'),
    signedBy: 'Dr Karim',
  },
  note,
  nextVisit: null,
  ...patch,
});

describe('prescription print data', () => {
  it('names the medicine by brand, strength and form, skipping a missing strength', () => {
    expect(prescriptionPrintDataOf(sources()).lines[0]?.medicine).toBe('Napa Syrup');
  });

  it('takes allergies and advice from the signed note', () => {
    const data = prescriptionPrintDataOf(sources());
    expect(data.allergies).toEqual({ status: 'NO_KNOWN_ALLERGIES' });
    expect(data.advice).toBe('Rest at home');
    expect(data.doctor).toEqual({ nameEn: 'Dr Karim', degrees: 'MBBS' });
  });

  it('prints allergies as not recorded without a signed note (FR-CLI-007)', () => {
    const data = prescriptionPrintDataOf(sources({ note: null }));
    expect(data.allergies).toEqual({ status: 'NOT_RECORDED' });
    expect(data.advice).toBeUndefined();
  });

  it('marks version 2 and later as amended (UC-CLI-02)', () => {
    expect(prescriptionPrintDataOf(sources()).amended).toBe(false);
    const second = sources().version;
    expect(prescriptionPrintDataOf(sources({ version: { ...second, versionNo: 2 } })).amended).toBe(
      true,
    );
  });
});
