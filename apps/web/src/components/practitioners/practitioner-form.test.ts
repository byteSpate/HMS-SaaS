import type { Practitioner } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { differsFrom, fieldsOf, formOf, hasName, practitionerName } from './practitioner-form';

// The practitioner dialog's form rules (T-PRA-01; FR-PRA-001). Names are synthetic (AS-009).
const nasrin: Practitioner = {
  practitionerId: '0199e0b0-0000-7000-8000-000000000501',
  nameBn: null,
  nameEn: 'Nasrin Akter',
  degrees: 'MBBS',
  specialty: 'Paediatrics',
  phone: null,
  registrationNo: null,
  active: true,
  version: 3,
};

describe('practitioner form', () => {
  it('starts empty and active for a new practitioner', () => {
    expect(formOf()).toEqual({
      nameBn: '',
      nameEn: '',
      degrees: '',
      specialty: '',
      phone: '',
      registrationNo: '',
      active: true,
    });
  });

  it('sends blank fields as null and trims the rest', () => {
    const form = { ...formOf(nasrin), specialty: '  Neonatology ', degrees: '   ' };
    expect(fieldsOf(form)).toMatchObject({ specialty: 'Neonatology', degrees: null, phone: null });
  });

  it('needs a name in either script', () => {
    expect(hasName(formOf())).toBe(false);
    expect(hasName({ ...formOf(), nameBn: '\u09A8\u09BE\u09B8\u09B0\u09BF\u09A8' })).toBe(true);
    expect(hasName({ ...formOf(), nameEn: '   ' })).toBe(false);
  });

  it('sees a change only when the saved record would differ', () => {
    expect(differsFrom(nasrin, formOf(nasrin))).toBe(false);
    expect(differsFrom(nasrin, { ...formOf(nasrin), specialty: 'Paediatrics ' })).toBe(false);
    expect(differsFrom(nasrin, { ...formOf(nasrin), active: false })).toBe(true);
    expect(differsFrom(nasrin, { ...formOf(nasrin), degrees: '' })).toBe(true);
  });

  it('shows the English name, else the Bangla one', () => {
    expect(practitionerName(nasrin)).toBe('Nasrin Akter');
    expect(practitionerName({ nameEn: null, nameBn: 'x' })).toBe('x');
  });
});
