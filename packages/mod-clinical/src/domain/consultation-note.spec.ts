import type { NoteContent } from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import {
  assertCanAmend,
  assertCanDiscard,
  assertCanSaveDraft,
  assertCanSign,
  noteStatusOf,
  type StoredNoteState,
} from './consultation-note.js';

// The consultation note's rules (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-02; SP-03; FPR-06).

const codeOf = (action: () => void): string | undefined => {
  try {
    action();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'not a DomainError';
  }
  return undefined;
};

const content = (patch: Partial<NoteContent> = {}): NoteContent => ({
  complaint: 'Fever for three days',
  history: null,
  examination: null,
  assessment: null,
  advice: null,
  allergies: { status: 'NOT_ASKED' },
  ...patch,
});

const firstDraft: StoredNoteState = {
  status: 'DRAFT',
  signedVersionNo: 0,
  hasDraft: true,
  version: 3,
};
const signed: StoredNoteState = {
  status: 'SIGNED',
  signedVersionNo: 1,
  hasDraft: false,
  version: 4,
};

describe('noteStatusOf', () => {
  it('is NONE without a note or after the first draft was discarded', () => {
    expect(noteStatusOf(null)).toBe('NONE');
    expect(noteStatusOf({ ...firstDraft, hasDraft: false })).toBe('NONE');
  });

  it('is DRAFT with a draft and SIGNED without one', () => {
    expect(noteStatusOf(firstDraft)).toBe('DRAFT');
    expect(noteStatusOf(signed)).toBe('SIGNED');
    expect(noteStatusOf({ ...signed, status: 'DRAFT', hasDraft: true })).toBe('DRAFT');
  });
});

describe('note commands', () => {
  it('SP-03: saves a draft at the version the screen holds, 0 for a new note', () => {
    expect(codeOf(() => assertCanSaveDraft(null, 0))).toBeUndefined();
    expect(codeOf(() => assertCanSaveDraft(null, 1))).toBe('STALE_RECORD');
    expect(codeOf(() => assertCanSaveDraft(firstDraft, 3))).toBeUndefined();
    expect(codeOf(() => assertCanSaveDraft(firstDraft, 2))).toBe('STALE_RECORD');
  });

  it('AT-CLI-005: a signed note cannot be edited without an amendment', () => {
    expect(codeOf(() => assertCanSaveDraft(signed, 4))).toBe('INVALID_TRANSITION');
  });

  it('signs a draft with something written; an empty one is VALIDATION_FAILED', () => {
    expect(codeOf(() => assertCanSign(firstDraft, 3, content()))).toBeUndefined();
    const empty = content({ complaint: '  ' });
    expect(codeOf(() => assertCanSign(firstDraft, 3, empty))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => assertCanSign(signed, 4, null))).toBe('INVALID_TRANSITION');
    expect(codeOf(() => assertCanSign(firstDraft, 2, content()))).toBe('STALE_RECORD');
  });

  it('UC-CLI-02: only a signed note is amended', () => {
    expect(codeOf(() => assertCanAmend(signed, 4))).toBeUndefined();
    expect(codeOf(() => assertCanAmend(firstDraft, 3))).toBe('INVALID_TRANSITION');
    expect(codeOf(() => assertCanAmend(null, 1))).toBe('NOT_FOUND');
  });

  it('FR-CLI-003: an unsigned draft can be discarded; a signed note cannot', () => {
    expect(codeOf(() => assertCanDiscard(firstDraft, 3))).toBeUndefined();
    expect(codeOf(() => assertCanDiscard(signed, 4))).toBe('INVALID_TRANSITION');
  });
});
