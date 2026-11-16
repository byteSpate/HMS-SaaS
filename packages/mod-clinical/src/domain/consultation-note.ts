// The consultation note's rules (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-01 step 5, C1; UC-CLI-02;
// SP-03; C-029, FPR-06). Pure: the note's status as the screen sees it, and whether a draft may be
// saved, signed, amended or discarded at the version the screen holds. A signed note changes only
// through an amendment, which signs as the next version.
import { NOTE_SECTIONS, type NoteContent, type NoteStatus } from '@hms/contracts';
import { DomainError, fieldError } from '@hms/domain-kernel';

/** The stored note as the rules need it; null when the consultation has no note yet. */
export interface StoredNoteState {
  status: 'DRAFT' | 'SIGNED';
  signedVersionNo: number;
  hasDraft: boolean;
  version: number;
}

/** NONE until something is written, and again after a first draft is discarded. */
export function noteStatusOf(note: StoredNoteState | null): NoteStatus {
  if (!note) return 'NONE';
  if (note.status === 'SIGNED') return 'SIGNED';
  return note.hasDraft ? 'DRAFT' : 'NONE';
}

const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'The note changed elsewhere; reload it', { currentVersion });

function assertVersion(note: StoredNoteState | null, expectedVersion: number): void {
  const current = note?.version ?? 0;
  if (current !== expectedVersion) throw stale(current);
}

/** AT-CLI-005: a signed note is edited only after "Amend". */
export function assertCanSaveDraft(note: StoredNoteState | null, expectedVersion: number): void {
  assertVersion(note, expectedVersion);
  if (note?.status === 'SIGNED') {
    throw new DomainError('INVALID_TRANSITION', 'The note is signed; amend it to change it');
  }
}

const hasText = (text: string | null) => text !== null && text.trim().length > 0;

/** UC-CLI-01 step 5: a draft with at least one section written. */
export function assertCanSign(
  note: StoredNoteState | null,
  expectedVersion: number,
  draft: NoteContent | null,
): void {
  if (!note) throw new DomainError('NOT_FOUND', 'There is no note to sign');
  assertVersion(note, expectedVersion);
  if (note.status !== 'DRAFT' || !draft) {
    throw new DomainError('INVALID_TRANSITION', 'There is no draft to sign');
  }
  if (!NOTE_SECTIONS.some((section) => hasText(draft[section]))) {
    throw fieldError('content', 'Write at least one section before signing');
  }
}

/** UC-CLI-02: an amendment starts from a signed note. */
export function assertCanAmend(note: StoredNoteState | null, expectedVersion: number): void {
  if (!note) throw new DomainError('NOT_FOUND', 'There is no signed note to amend');
  assertVersion(note, expectedVersion);
  if (note.status !== 'SIGNED') {
    throw new DomainError('INVALID_TRANSITION', 'Only a signed note can be amended');
  }
}

/** FR-CLI-003: unsigned drafts can be discarded; signed versions never are. */
export function assertCanDiscard(note: StoredNoteState | null, expectedVersion: number): void {
  if (!note) throw new DomainError('NOT_FOUND', 'There is no draft to discard');
  assertVersion(note, expectedVersion);
  if (note.status !== 'DRAFT' || !note.hasDraft) {
    throw new DomainError('INVALID_TRANSITION', 'There is no draft to discard');
  }
}
