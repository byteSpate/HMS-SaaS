import { DomainError } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { correctionOf, type CurrentIdentity } from './identity-correction.js';

// Identity corrections (T-PAT-04; FR-PAT-008; C-034).
const TODAY = '2026-11-04';
const current: CurrentIdentity = {
  nameBn: null,
  nameEn: 'Salma Begum',
  sex: 'FEMALE',
  birthDate: '1990-05-14',
  birthDatePrecision: 'EXACT',
  reportedAgeYears: null,
  reportedAgeOn: null,
  phoneRaw: '01711000001',
  phoneNormalized: '01711000001',
  addressText: null,
};

function fieldsOf(action: () => unknown): string[] {
  try {
    action();
  } catch (error) {
    return ((error as DomainError).details?.fields as { path: string }[]).map((f) => f.path);
  }
  throw new Error('expected a validation error');
}

describe('correctionOf', () => {
  it('changes only what differs and keeps the previous values', () => {
    const correction = correctionOf(
      current,
      { nameEn: 'Salma  Begum', phone: '+880 1811-000002', addressText: 'Mirpur 10' },
      TODAY,
    );
    expect(correction.fields).toEqual(['phone', 'addressText']);
    expect(correction.columns).toEqual({
      phoneRaw: '+880 1811-000002',
      phoneNormalized: '01811000002',
      addressText: 'Mirpur 10',
    });
    expect(correction.previous).toEqual({ phone: '01711000001', addressText: null });
  });

  it('replaces an exact date by an age as one birth change, never inventing a date', () => {
    const correction = correctionOf(current, { reportedAgeYears: 40 }, TODAY);
    expect(correction.fields).toEqual(['birth']);
    expect(correction.columns).toMatchObject({
      birthDate: null,
      birthDatePrecision: 'YEAR_ESTIMATED',
      birthYear: 1986,
      reportedAgeYears: 40,
      reportedAgeOn: TODAY,
    });
    expect(correction.previous.birth).toMatchObject({ birthDate: '1990-05-14' });
  });

  it('sees no change in the same values, and returns a given NID as digits', () => {
    const correction = correctionOf(
      current,
      { nameEn: 'Salma Begum', sex: 'FEMALE', birthDate: '1990-05-14', nid: '123 456 7890' },
      TODAY,
    );
    expect(correction.fields).toEqual([]);
    expect(correction.nid).toBe('1234567890');
  });

  it('clears an optional field with null, but a name must remain (C-034)', () => {
    expect(correctionOf({ ...current, nameBn: 'x' }, { nameEn: null }, TODAY).fields).toEqual([
      'nameEn',
    ]);
    expect(fieldsOf(() => correctionOf(current, { nameEn: null }, TODAY))).toEqual([
      'changes.nameEn',
    ]);
  });

  it('refuses an invalid phone, NID or birth date with the field path', () => {
    expect(fieldsOf(() => correctionOf(current, { phone: '123' }, TODAY))).toEqual([
      'changes.phone',
    ]);
    expect(fieldsOf(() => correctionOf(current, { nid: '12345' }, TODAY))).toEqual(['changes.nid']);
    expect(fieldsOf(() => correctionOf(current, { birthDate: '2030-01-01' }, TODAY))).toEqual([
      'changes.birthDate',
    ]);
  });
});
