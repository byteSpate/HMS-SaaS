// The life of a clinical document (T-CLI-02 note, T-CLI-03 prescription; FR-CLI-003; UC-CLI-02;
// SP-03; C-029, FPR-06). Pure: the document's status as the screen sees it, and whether a draft
// may be saved, signed, amended or discarded at the version the screen holds. A signed document
// changes only through an amendment, which signs as the next version. Each kind adds its own
// content rule for signing.
import { DomainError } from '@hms/domain-kernel';

/** The stored document as the rules need it; null when the consultation has none yet. */
export interface StoredDocumentState {
  status: 'DRAFT' | 'SIGNED';
  signedVersionNo: number;
  hasDraft: boolean;
  version: number;
}

export type DocumentStatus = 'NONE' | 'DRAFT' | 'SIGNED';

/** The rules of one document kind, with its name in the messages ("note", "prescription"). */
export function documentRules(noun: string) {
  const stale = (currentVersion: number) =>
    new DomainError('STALE_RECORD', `The ${noun} changed elsewhere; reload it`, {
      currentVersion,
    });

  function assertVersion(document: StoredDocumentState | null, expectedVersion: number): void {
    const current = document?.version ?? 0;
    if (current !== expectedVersion) throw stale(current);
  }

  return {
    stale,

    /** NONE until something is written, and again after a first draft is discarded. */
    statusOf(document: StoredDocumentState | null): DocumentStatus {
      if (!document) return 'NONE';
      if (document.status === 'SIGNED') return 'SIGNED';
      return document.hasDraft ? 'DRAFT' : 'NONE';
    },

    /** AT-CLI-005: a signed document is edited only after "Amend". */
    assertCanSaveDraft(document: StoredDocumentState | null, expectedVersion: number): void {
      assertVersion(document, expectedVersion);
      if (document?.status === 'SIGNED') {
        throw new DomainError('INVALID_TRANSITION', `The ${noun} is signed; amend it to change it`);
      }
    },

    /** A draft exists at the version the screen holds; the kind then checks the content. */
    assertCanSignDraft(document: StoredDocumentState | null, expectedVersion: number): void {
      if (!document) throw new DomainError('NOT_FOUND', `There is no ${noun} to sign`);
      assertVersion(document, expectedVersion);
      if (document.status !== 'DRAFT' || !document.hasDraft) {
        throw new DomainError('INVALID_TRANSITION', 'There is no draft to sign');
      }
    },

    /** UC-CLI-02: an amendment starts from a signed document. */
    assertCanAmend(document: StoredDocumentState | null, expectedVersion: number): void {
      if (!document) throw new DomainError('NOT_FOUND', `There is no signed ${noun} to amend`);
      assertVersion(document, expectedVersion);
      if (document.status !== 'SIGNED') {
        throw new DomainError('INVALID_TRANSITION', `Only a signed ${noun} can be amended`);
      }
    },

    /** FR-CLI-003: unsigned drafts can be discarded; signed versions never are. */
    assertCanDiscard(document: StoredDocumentState | null, expectedVersion: number): void {
      if (!document) throw new DomainError('NOT_FOUND', 'There is no draft to discard');
      assertVersion(document, expectedVersion);
      if (document.status !== 'DRAFT' || !document.hasDraft) {
        throw new DomainError('INVALID_TRANSITION', 'There is no draft to discard');
      }
    },
  };
}
