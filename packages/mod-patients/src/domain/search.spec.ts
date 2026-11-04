import { DomainError } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { ageOn } from './age.js';
import { searchTermOf } from './search-term.js';

// Search terms and ages (T-PAT-02; FR-PAT-003, FR-PAT-006, FR-I18N-003).
describe('searchTermOf', () => {
  it('reads an MRN whatever its case', () => {
    expect(searchTermOf(' smh-000123 ')).toEqual({ kind: 'MRN', mrn: 'SMH-000123' });
  });

  it.each([
    '01700-000001',
    '+880 1700 000001',
    '\u09e6\u09e7\u09ed\u09e6\u09e6\u09e6\u09e6\u09e6\u09e6\u09e6\u09e7',
  ])('AT-PAT-007: reads %s as the same mobile number', (raw) => {
    expect(searchTermOf(raw)).toEqual({ kind: 'PHONE', phone: '01700000001' });
  });

  it('reads other digits as the number part of an MRN', () => {
    expect(searchTermOf('123')).toEqual({ kind: 'MRN_NUMBER', mrnSuffix: '-000123' });
    expect(searchTermOf('\u09e7\u09e8\u09e9')).toEqual({
      kind: 'MRN_NUMBER',
      mrnSuffix: '-000123',
    });
  });

  it('reads anything else as a name, composed and tidied', () => {
    expect(searchTermOf('  Salma   Begum ')).toEqual({ kind: 'NAME', name: 'Salma Begum' });
    expect(searchTermOf('\u09b8\u09be\u09b2\u09ae\u09be')).toEqual({
      kind: 'NAME',
      name: '\u09b8\u09be\u09b2\u09ae\u09be',
    });
  });

  it('refuses a one-letter name', () => {
    expect(() => searchTermOf('a')).toThrow(DomainError);
  });
});

describe('ageOn', () => {
  const exact = { birthDate: '1990-05-14', birthDatePrecision: 'EXACT', birthYear: 1990 };

  it('counts whole years for an exact date', () => {
    expect(ageOn(exact, '2026-05-13')).toEqual({ years: 35, estimated: false });
    expect(ageOn(exact, '2026-05-14')).toEqual({ years: 36, estimated: false });
  });

  it('marks an age from a reported age as estimated', () => {
    const estimate = { birthDate: null, birthDatePrecision: 'YEAR_ESTIMATED', birthYear: 1986 };
    expect(ageOn(estimate, '2026-11-04')).toEqual({ years: 40, estimated: true });
  });

  it('has no age when nothing is known', () => {
    expect(
      ageOn({ birthDate: null, birthDatePrecision: 'UNKNOWN', birthYear: null }, '2026-11-04'),
    ).toBeNull();
  });
});
