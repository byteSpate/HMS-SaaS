import { DomainError } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { assertCandidatesConfirmed } from './duplicate-policy.js';
import { birthFactsOf, identityFactsOf, normalizeName } from './patient-identity.js';
import { normalizedMobile, normalizePhone } from './phone.js';

// Patient domain rules (T-PAT-01; FR-PAT-001, -003, -005, -006, -009; C-034).
const TODAY = '2026-11-04';

function fieldsOf(action: () => unknown): string[] {
  try {
    action();
  } catch (error) {
    const fields = (error as DomainError).details?.fields as { path: string }[] | undefined;
    return fields?.map((field) => field.path) ?? [];
  }
  throw new Error('expected a validation error');
}

describe('normalizePhone (FR-PAT-003)', () => {
  it.each([
    ['01700000001', '01700000001'],
    ['+880 1700-000001', '01700000001'],
    ['8801700000001', '01700000001'],
    ['(017) 00.000.001', '01700000001'],
    ['\u09e6\u09e7\u09ed\u09e6\u09e6\u09e6\u09e6\u09e6\u09e6\u09e6\u09e7', '01700000001'],
  ])('%s becomes %s', (raw, normalized) => {
    expect(normalizePhone(raw)).toBe(normalized);
    expect(normalizedMobile(raw)).toBe(normalized);
  });

  it('rejects what is not a Bangladesh mobile number', () => {
    expect(normalizedMobile('12345')).toBeNull();
    expect(normalizedMobile('01200000001')).toBeNull();
    expect(normalizedMobile('017000000012')).toBeNull();
  });
});

describe('names (FR-PAT-009)', () => {
  it('tidies spaces and composes Unicode, keeping the script', () => {
    expect(normalizeName('  Salma   Begum ')).toBe('Salma Begum');
    // A + combining ring composes to one character under NFC.
    expect(normalizeName('A\u030angstrom')).toBe('\u00c5ngstrom');
    expect(normalizeName(undefined)).toBeNull();
  });
});

describe('birth facts (FR-PAT-006)', () => {
  it('keeps an exact date', () => {
    expect(birthFactsOf({ birthDate: '1990-05-14', phone: null }, TODAY)).toEqual({
      birthDate: '1990-05-14',
      birthDatePrecision: 'EXACT',
      birthYear: 1990,
      reportedAgeYears: null,
      reportedAgeOn: null,
    });
  });

  it('never invents a date from an age', () => {
    expect(birthFactsOf({ reportedAgeYears: 40, phone: null }, TODAY)).toEqual({
      birthDate: null,
      birthDatePrecision: 'YEAR_ESTIMATED',
      birthYear: 1986,
      reportedAgeYears: 40,
      reportedAgeOn: TODAY,
    });
  });

  it('refuses a future or impossible birth date', () => {
    expect(fieldsOf(() => birthFactsOf({ birthDate: '2026-11-05', phone: null }, TODAY))).toEqual([
      'birthDate',
    ]);
    expect(fieldsOf(() => birthFactsOf({ birthDate: '1850-01-01', phone: null }, TODAY))).toEqual([
      'birthDate',
    ]);
  });
});

describe('identity facts (C-034)', () => {
  it('needs a name and a valid mobile number unless the patient has none', () => {
    expect(
      fieldsOf(() =>
        identityFactsOf({ nameEn: '   ', birthDate: '1990-01-01', phone: null }, TODAY),
      ),
    ).toEqual(['nameEn']);
    expect(
      fieldsOf(() =>
        identityFactsOf({ nameEn: 'Karim', birthDate: '1990-01-01', phone: '123' }, TODAY),
      ),
    ).toEqual(['phone']);
    expect(
      identityFactsOf(
        { nameBn: '\u0995\u09b0\u09bf\u09ae', birthDate: '1990-01-01', phone: null },
        TODAY,
      ),
    ).toMatchObject({ nameBn: '\u0995\u09b0\u09bf\u09ae', nameEn: null, phoneNormalized: null });
  });
});

describe('candidate confirmation (FR-PAT-001)', () => {
  const nobodyShown = { confirmNewDespiteCandidates: false, shownCandidateIds: [] };

  it('lets a registration through when nobody matches', () => {
    expect(() => assertCandidatesConfirmed([], nobodyShown)).not.toThrow();
  });

  it('needs the confirmation and every candidate shown', () => {
    const refusal = (() => {
      try {
        assertCandidatesConfirmed(['a', 'b'], {
          confirmNewDespiteCandidates: true,
          shownCandidateIds: ['a'],
        });
      } catch (error) {
        return error as DomainError;
      }
      return undefined;
    })();
    expect(refusal?.details).toMatchObject({
      reason: 'DUPLICATE_CANDIDATES_PRESENT',
      candidateIds: ['a', 'b'],
    });
    expect(() => assertCandidatesConfirmed(['a'], nobodyShown)).toThrow(DomainError);
    expect(() =>
      assertCandidatesConfirmed(['a'], {
        confirmNewDespiteCandidates: true,
        shownCandidateIds: ['a'],
      }),
    ).not.toThrow();
  });
});
