// What the note and prescription commands share (T-CLI-02, T-CLI-03; FR-PRA-003; SP-03): only the
// consultation's doctor (the practitioner linked to the account) reads or writes its documents,
// a version-checked write decides a race, and the screen's view lists the signed versions with
// the signer's name.
import type { TenantTx } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { findStaffNames } from '@hms/mod-identity-access';
import { findPractitionerIdOfAccount } from '@hms/mod-patients';
import type { Scope } from '@hms/platform';
import type { DocumentStatus, StoredDocumentState } from '../domain/clinical-document.js';
import {
  updateDocument,
  type DocumentChange,
  type StoredDocument,
} from '../infrastructure/clinical-document.repository.js';
import {
  findConsultationOf,
  type StoredConsultation,
} from '../infrastructure/consultation.repository.js';

/** The signed-in doctor's own consultation; another doctor's reads as missing. */
export async function ownConsultation(
  tx: TenantTx,
  scope: Scope,
  consultationId: string,
): Promise<StoredConsultation> {
  const practitionerId = await findPractitionerIdOfAccount(tx, scope.userId);
  const consultation = practitionerId
    ? await findConsultationOf(tx, consultationId, practitionerId)
    : null;
  if (!consultation) throw new DomainError('NOT_FOUND', 'Consultation not found');
  return consultation;
}

/** Two first saves at once: the unique document per consultation and kind refuses the second. */
export const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

export function stateOf<C>(document: StoredDocument<C> | null): StoredDocumentState | null {
  return document
    ? {
        status: document.status,
        signedVersionNo: document.signedVersionNo,
        hasDraft: document.draft !== null,
        version: document.version,
      }
    : null;
}

/** The version check decides a race between the read and the write (SP-03). */
export async function changeDocument<C>(
  tx: TenantTx,
  target: { document: StoredDocument<C>; expectedVersion: number; at: Date },
  change: DocumentChange,
  stale: (currentVersion: number) => DomainError,
): Promise<void> {
  const changed = await updateDocument(
    tx,
    {
      documentId: target.document.documentId,
      expectedVersion: target.expectedVersion,
      at: target.at,
    },
    change,
  );
  if (changed === 0) throw stale(target.expectedVersion + 1);
}

/** The document as the screen shows it: draft, signed versions with signer names, version. */
export async function documentView<C>(
  tx: TenantTx,
  consultationId: string,
  document: StoredDocument<C> | null,
  statusOf: (state: StoredDocumentState | null) => DocumentStatus,
) {
  const names = await findStaffNames(
    tx,
    document?.versions.map((version) => version.signedBy) ?? [],
  );
  return {
    consultationId,
    status: statusOf(stateOf(document)),
    draft: document?.draft ?? null,
    draftSavedAt: document?.draftSavedAt?.toISOString() ?? null,
    amendReason: document?.amendReason ?? null,
    versions:
      document?.versions.map((version) => ({
        versionNo: version.versionNo,
        content: version.content,
        signedAt: version.signedAt.toISOString(),
        signedBy: names.get(version.signedBy) ?? '',
        amendReason: version.amendReason,
      })) ?? [],
    version: document?.version ?? 0,
  };
}
