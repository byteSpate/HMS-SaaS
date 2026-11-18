// Prescription form rules (T-CLI-03; FR-CLI-004..006).
import type { MedicineChoice, PrescriptionContent } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import {
  linesFormOf,
  linesOf,
  medicineLabel,
  newLine,
  readyToSign,
  sameLines,
  termLabel,
} from './prescription-form';

const napa: MedicineChoice = {
  medicineId: '0199e0b0-0000-7000-8000-000000000701',
  brandName: 'Napa',
  genericName: 'Paracetamol',
  strength: '500 mg',
  form: 'Tablet',
  nameBn: null,
};
const LINE_ID = '0199e0b0-0000-7000-8000-000000000901';
const FREQUENCY = '0199e0b0-0000-7000-8000-000000000802';

describe('prescription form', () => {
  it('starts a line for the hospital pharmacy and sends blanks as null', () => {
    const line = { ...newLine(napa, LINE_ID), dose: ' 1 tablet ', quantity: '21' };
    expect(linesOf([line])).toEqual([
      {
        lineId: LINE_ID,
        medicineId: napa.medicineId,
        dose: '1 tablet',
        routeTermId: null,
        frequencyTermId: null,
        durationTermId: null,
        instructionsBn: null,
        instructionsEn: null,
        quantity: 21,
        fulfilment: 'HOSPITAL_PHARMACY',
        patientNote: null,
      },
    ]);
  });

  it('holds the request back while a quantity is not a whole number 1-9999', () => {
    expect(linesOf([{ ...newLine(napa, LINE_ID), quantity: '0' }])).toBeNull();
    expect(linesOf([{ ...newLine(napa, LINE_ID), quantity: '2.5' }])).toBeNull();
    expect(linesOf([{ ...newLine(napa, LINE_ID), quantity: '' }])?.[0]?.quantity).toBeNull();
  });

  it('signs only lines that say how often or have instructions', () => {
    const bare = newLine(napa, LINE_ID);
    expect(readyToSign([])).toBe(false);
    expect(readyToSign([bare])).toBe(false);
    expect(readyToSign([{ ...bare, frequencyTermId: FREQUENCY }])).toBe(true);
    expect(readyToSign([{ ...bare, instructionsBn: 'x' }])).toBe(true);
  });

  it('knows when the lines are what the server holds', () => {
    const inputs = linesOf([{ ...newLine(napa, LINE_ID), frequencyTermId: FREQUENCY }]) ?? [];
    const saved: PrescriptionContent = {
      lines: inputs.map((input) => ({
        ...input,
        medicine: napa,
        route: null,
        frequency: { termId: FREQUENCY, labelBn: null, labelEn: 'Once daily' },
        duration: null,
      })),
    };
    expect(sameLines(inputs, saved)).toBe(true);
    expect(linesFormOf(saved)[0]?.frequencyTermId).toBe(FREQUENCY);
    const changed = linesOf([{ ...linesFormOf(saved)[0]!, dose: '2 tablets' }]) ?? [];
    expect(sameLines(changed, saved)).toBe(false);
    expect(sameLines([], null)).toBe(true);
  });

  it('names medicines and list entries for the screen', () => {
    expect(medicineLabel(napa)).toBe('Napa 500 mg Tablet');
    expect(medicineLabel({ ...napa, strength: null })).toBe('Napa Tablet');
    const term = { termId: FREQUENCY, labelBn: null, labelEn: 'Once daily' };
    expect(termLabel(term, 'bn-BD')).toBe('Once daily');
    expect(termLabel({ ...term, labelBn: 'bn label' }, 'bn-BD')).toBe('bn label');
  });
});
