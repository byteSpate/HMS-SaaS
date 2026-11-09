import type { Practitioner } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import {
  departmentOptions,
  differsFrom,
  fieldsOf,
  formOf,
  hasName,
  practitionerName,
} from './practitioner-form';

// The practitioner dialog's form rules (T-PRA-01; FR-PRA-001). Names are synthetic (AS-009).
const nasrin: Practitioner = {
  practitionerId: '0199e0b0-0000-7000-8000-000000000501',
  nameBn: null,
  nameEn: 'Nasrin Akter',
  degrees: 'MBBS',
  specialty: 'Paediatrics',
  phone: null,
  registrationNo: null,
  department: null,
  active: true,
  version: 3,
};

const medicine = {
  departmentId: '0199e0b0-0000-7000-8000-000000000601',
  code: 'MED',
  nameBn: null,
  nameEn: 'Medicine',
};
const surgery = {
  ...medicine,
  departmentId: '0199e0b0-0000-7000-8000-000000000602',
  code: 'SURG',
  nameEn: null,
  nameBn: 'x',
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
      departmentId: '',
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
    expect(differsFrom(nasrin, { ...formOf(nasrin), departmentId: medicine.departmentId })).toBe(
      true,
    );
  });

  it('sends the chosen department, or null for none', () => {
    expect(fieldsOf(formOf(nasrin)).departmentId).toBeNull();
    expect(fieldsOf({ ...formOf(nasrin), departmentId: medicine.departmentId }).departmentId).toBe(
      medicine.departmentId,
    );
  });

  it('offers none and the active departments, keeping a deactivated current one', () => {
    expect(departmentOptions([medicine], null, 'None')).toEqual([
      { value: '', label: 'None' },
      { value: medicine.departmentId, label: 'MED - Medicine' },
    ]);
    expect(departmentOptions([medicine], surgery, 'None').map((option) => option.label)).toEqual([
      'None',
      'MED - Medicine',
      'SURG - x',
    ]);
  });

  it('shows the English name, else the Bangla one', () => {
    expect(practitionerName(nasrin)).toBe('Nasrin Akter');
    expect(practitionerName({ nameEn: null, nameBn: 'x' })).toBe('x');
  });
});
