import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { addDays, fieldWithProblem, formOf, hospitalToday, requestOf } from './session-form';

// The session dialog's form rules (T-SCH-01; FR-SCH-002; C-035). IDs are synthetic.
const DOCTOR = '0199e0b0-0000-7000-8000-000000000701';
const filled = {
  ...formOf('2026-11-12'),
  practitionerId: DOCTOR,
  startTime: '17:00',
  endTime: '21:00',
  capacity: '20',
};

describe('session form', () => {
  it('starts on the given date with nothing else chosen', () => {
    expect(formOf('2026-11-12')).toEqual({
      practitionerId: '',
      sessionDate: '2026-11-12',
      startTime: '',
      endTime: '',
      capacity: '',
    });
  });

  it('sends a complete form as the create request, capacity as a number', () => {
    expect(requestOf(filled)).toEqual({
      practitionerId: DOCTOR,
      sessionDate: '2026-11-12',
      startTime: '17:00',
      endTime: '21:00',
      capacity: 20,
    });
  });

  it('sends nothing while a field is missing or wrong', () => {
    expect(requestOf(formOf('2026-11-12'))).toBeNull();
    expect(requestOf({ ...filled, capacity: '0' })).toBeNull();
    expect(requestOf({ ...filled, capacity: '2.5' })).toBeNull();
    expect(requestOf({ ...filled, capacity: '501' })).toBeNull();
    expect(requestOf({ ...filled, endTime: '17:00' })).toBeNull();
  });

  it('names the field the API refused', () => {
    const refused = (path: string) =>
      new ApiError('VALIDATION_FAILED', 422, {
        type: 'urn:hms:error:VALIDATION_FAILED',
        title: 'Request body is invalid',
        status: 422,
        code: 'VALIDATION_FAILED',
        fields: [{ path, message: 'no' }],
      } as never);
    expect(fieldWithProblem(refused('startTime'))).toBe('startTime');
    expect(fieldWithProblem(refused('sessionDate'))).toBe('sessionDate');
    expect(fieldWithProblem(new ApiError('STALE_RECORD', 409))).toBeNull();
    expect(fieldWithProblem(null)).toBeNull();
  });

  it("uses the hospital's date, not the browser's", () => {
    expect(hospitalToday(new Date('2026-11-12T19:00:00Z'))).toBe('2026-11-13');
    expect(hospitalToday(new Date('2026-11-12T17:59:00Z'))).toBe('2026-11-12');
  });

  it('adds days across a month end', () => {
    expect(addDays('2026-11-28', 6)).toBe('2026-12-04');
    expect(addDays('2026-11-12', 0)).toBe('2026-11-12');
  });
});
