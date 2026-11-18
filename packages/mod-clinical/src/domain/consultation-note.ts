// The consultation note's rules (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-01 step 5, C1; UC-CLI-02;
// SP-03; C-029, FPR-06). The draft, sign, amend and discard rules are those of every clinical
// document (clinical-document.ts); a note signs only with at least one section written.
import { NOTE_SECTIONS, type NoteContent, type NoteStatus } from '@hms/contracts';
import { fieldError } from '@hms/domain-kernel';
import { documentRules, type StoredDocumentState } from './clinical-document.js';

export type StoredNoteState = StoredDocumentState;

const rules = documentRules('note');

export const noteStatusOf: (note: StoredNoteState | null) => NoteStatus = rules.statusOf;
export const assertCanSaveDraft = rules.assertCanSaveDraft;
export const assertCanAmend = rules.assertCanAmend;
export const assertCanDiscard = rules.assertCanDiscard;

const hasText = (text: string | null) => text !== null && text.trim().length > 0;

/** UC-CLI-01 step 5: a draft with at least one section written. */
export function assertCanSign(
  note: StoredNoteState | null,
  expectedVersion: number,
  draft: NoteContent | null,
): void {
  rules.assertCanSignDraft(
    note && { ...note, hasDraft: note.hasDraft && draft !== null },
    expectedVersion,
  );
  if (!draft || !NOTE_SECTIONS.some((section) => hasText(draft[section]))) {
    throw fieldError('content', 'Write at least one section before signing');
  }
}
