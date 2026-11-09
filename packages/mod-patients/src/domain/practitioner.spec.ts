import { describe, expect, it } from 'vitest';
import { changedPractitionerFields, practitionerValuesOf, tidyText } from './practitioner.js';

// Practitioner values (T-PRA-01; FR-PRA-001). Names are synthetic (AS-009).
describe('practitioner values', () => {
  it('tidies spaces and treats blank as not recorded', () => {
    expect(tidyText('  Dr.   Karim  Uddin ')).toBe('Dr. Karim Uddin');
    expect(tidyText('   ')).toBeNull();
    expect(tidyText(undefined)).toBeNull();
    expect(tidyText(null)).toBeNull();
  });

  it('stores Bangla in NFC, so the same name typed two ways compares equal', () => {
    // KA + E sign + AA sign, as some keyboards type it, is KA + O sign in NFC.
    const typedInParts = String.fromCharCode(0x0995, 0x09c7, 0x09be);
    const composed = String.fromCharCode(0x0995, 0x09cb);
    expect(tidyText(typedInParts)).toBe(composed);
  });

  it('fills every field, absent ones as null', () => {
    expect(practitionerValuesOf({ nameEn: 'Karim Uddin', specialty: ' Medicine ' })).toEqual({
      nameBn: null,
      nameEn: 'Karim Uddin',
      degrees: null,
      specialty: 'Medicine',
      phone: null,
      registrationNo: null,
    });
  });

  it('lists the changed fields, active included, and nothing for an unchanged record', () => {
    const stored = { ...practitionerValuesOf({ nameEn: 'Karim Uddin' }), active: true };
    expect(changedPractitionerFields(stored, { ...stored })).toEqual([]);
    expect(
      changedPractitionerFields(stored, { ...stored, specialty: 'Medicine', active: false }),
    ).toEqual(['specialty', 'active']);
  });
});
