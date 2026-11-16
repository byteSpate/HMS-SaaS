import type { NoteContent } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { allergyItemsOf, contentOf, formOf, hasWriting, sameContent } from './note-form';

// The consultation note form's rules (T-CLI-02; FR-CLI-003, FR-CLI-007; Q-066 interim).

const signed: NoteContent = {
  complaint: 'Fever for three days',
  history: null,
  examination: null,
  assessment: 'Viral fever',
  advice: null,
  allergies: { status: 'KNOWN_ALLERGIES', items: ['Penicillin', 'Sulfa'] },
};

describe('note form', () => {
  it('starts empty with allergies not asked, never "no allergies" (FR-CLI-007)', () => {
    expect(formOf(null)).toMatchObject({
      complaint: '',
      allergyStatus: 'NOT_ASKED',
      allergyItems: '',
    });
    expect(contentOf(formOf(null))).toMatchObject({ allergies: { status: 'NOT_ASKED' } });
  });

  it('round-trips a note: blank sections as null, allergies one per line', () => {
    const form = formOf(signed);
    expect(form.allergyItems).toBe('Penicillin\nSulfa');
    expect(contentOf(form)).toEqual(signed);
  });

  it('splits allergies on new lines and commas, dropping blanks', () => {
    expect(allergyItemsOf(' Penicillin, Sulfa\n\n Latex ')).toEqual([
      'Penicillin',
      'Sulfa',
      'Latex',
    ]);
  });

  it('cannot save known allergies without one listed', () => {
    expect(contentOf({ ...formOf(null), allergyStatus: 'KNOWN_ALLERGIES' })).toBeNull();
    expect(contentOf({ ...formOf(null), allergyStatus: 'NO_KNOWN_ALLERGIES' })?.allergies).toEqual({
      status: 'NO_KNOWN_ALLERGIES',
    });
  });

  it('signs only with something written, and compares contents for autosave', () => {
    expect(hasWriting(formOf(null))).toBe(false);
    expect(hasWriting({ ...formOf(null), advice: ' Rest ' })).toBe(true);
    expect(sameContent(signed, contentOf(formOf(signed)))).toBe(true);
    expect(sameContent(signed, { ...signed, advice: 'Rest' })).toBe(false);
  });
});
