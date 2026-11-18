import { describe, expect, it } from 'vitest';
import { renderPrescriptionHtml, type PrescriptionPrintData } from './index.js';

// The prescription print (T-CLI-03; FR-CLI-005..007; C-044). Synthetic data; Bangla written as
// escapes so the source stays ASCII.
const PATIENT_BN = '\u09B8\u09BE\u09B2\u09AE\u09BE';
const AFTER_MEALS_BN = '\u0996\u09BE\u0993\u09AF\u09BC\u09BE\u09B0 \u09AA\u09B0\u09C7';

const sample: PrescriptionPrintData = {
  hospital: { nameEn: 'Example General Hospital' },
  doctor: {
    nameEn: 'Dr Karim Uddin',
    degrees: 'MBBS, FCPS (Medicine)',
    registrationNo: 'A-12345',
  },
  patient: { nameEn: 'Salma Begum', nameBn: PATIENT_BN, mrn: 'MRN-000123' },
  allergies: { status: 'KNOWN_ALLERGIES', items: ['Penicillin'] },
  lines: [
    {
      medicine: 'Napa 500 mg Tablet',
      genericName: 'Paracetamol',
      dose: '1 tablet',
      route: { labelEn: 'Oral', labelBn: null },
      frequency: { labelEn: 'Three times daily', labelBn: null },
      duration: { labelEn: '7 days', labelBn: null },
      instructionsEn: 'After meals',
      instructionsBn: AFTER_MEALS_BN,
      quantity: 21,
      fulfilment: 'HOSPITAL_PHARMACY',
    },
    {
      medicine: 'Amoxil 500 mg Capsule',
      genericName: 'Amoxicillin',
      dose: null,
      route: null,
      frequency: null,
      duration: null,
      instructionsEn: 'As directed',
      instructionsBn: null,
      quantity: null,
      fulfilment: 'EXTERNAL',
    },
  ],
  advice: 'Drink plenty of water',
  nextVisit: '2026-11-25',
  signedBy: 'Dr Karim Uddin',
  signedAt: '2026-11-18T05:30:00.000Z',
  amended: false,
};

describe('prescription template', () => {
  it('is A4 portrait (C-044)', () => {
    expect(renderPrescriptionHtml(sample, 'en')).toMatch(/@page\s*\{\s*size:\s*A4 portrait/);
  });

  it('shows the doctor, the patient, the lines, the advice and the next visit (FR-CLI-005)', () => {
    const html = renderPrescriptionHtml(sample, 'en');
    for (const text of [
      'Dr Karim Uddin',
      'MBBS, FCPS (Medicine)',
      'Reg. no. A-12345',
      'MRN-000123',
      'Napa 500 mg Tablet',
      'Paracetamol',
      '1 tablet - Oral - Three times daily - 7 days',
      'After meals',
      'Drink plenty of water',
      'Next visit:</strong> 25-11-2026',
      'Signed electronically by Dr Karim Uddin at 18-11-2026 11:30',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain(AFTER_MEALS_BN);
  });

  it('says where each line is supplied from (FR-CLI-006)', () => {
    const html = renderPrescriptionHtml(sample, 'en');
    expect(html).toContain('Hospital pharmacy');
    expect(html).toContain('Buy outside');
  });

  it('prints missing allergy data as not recorded, never as no allergies (FR-CLI-007)', () => {
    expect(renderPrescriptionHtml(sample, 'en')).toContain('Penicillin');
    const missing = renderPrescriptionHtml(
      { ...sample, allergies: { status: 'NOT_RECORDED' } },
      'en',
    );
    expect(missing).toContain('Not recorded');
    expect(missing).not.toContain('No known allergies');
  });

  it('marks an amended prescription with the date (UC-CLI-02)', () => {
    expect(renderPrescriptionHtml({ ...sample, amended: true }, 'en')).toContain(
      'Amended 18-11-2026',
    );
    expect(renderPrescriptionHtml(sample, 'en')).not.toContain('Amended');
  });

  it('prints Bangla with Bangla digits, and both when bilingual', () => {
    const bangla = renderPrescriptionHtml(sample, 'bn-BD');
    expect(bangla).toContain(PATIENT_BN);
    expect(bangla).toContain(AFTER_MEALS_BN);
    expect(bangla).toContain('\u09E8\u09E7');
    const both = renderPrescriptionHtml(sample, 'bilingual');
    expect(both).toContain(`After meals / ${AFTER_MEALS_BN}`);
  });

  it('escapes record values', () => {
    const html = renderPrescriptionHtml(
      { ...sample, advice: '<img src=x onerror=alert(1)>' },
      'en',
    );
    expect(html).not.toContain('<img src=x');
  });
});
