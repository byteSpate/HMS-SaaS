import { describe, expect, it } from 'vitest';
import { changedPractitionerFields, practitionerValuesOf } from './practitioner.js';

// Practitioner values (T-PRA-01; FR-PRA-001). Names are synthetic (AS-009). The text tidying
// itself is tested with tidyText in @hms/domain-kernel.
describe('practitioner values', () => {
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
