// The consultation note (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-01 steps 2 and 5, C1; UC-CLI-02;
// C-029, FPR-06; FR-AUD-001). Only the consultation's doctor (the practitioner linked to the
// account, FR-PRA-003) reads or writes it, so a draft is seen by its author only. Draft saves
// (autosave) are version-checked writes of the draft and are not audited: a draft is not a
// record. Signing, starting an amendment and discarding a draft are audited, and signing emits
// ConsultationSigned. Each command is one transaction.
import { Inject, Injectable } from '@nestjs/common';
import type {
  AmendNoteRequest,
  ConsultationNote,
  NoteVersionRequest,
  SaveNoteDraftRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { findStaffNames } from '@hms/mod-identity-access';
import { findPractitionerIdOfAccount } from '@hms/mod-patients';
import { PRISMA, recordChange, requestScope, type Scope } from '@hms/platform';
import {
  assertCanAmend,
  assertCanDiscard,
  assertCanSaveDraft,
  assertCanSign,
  noteStatusOf,
  type StoredNoteState,
} from '../domain/consultation-note.js';
import {
  findNoteOf,
  insertNote,
  insertVersion,
  markConsulted,
  updateNote,
  type NoteChange,
  type StoredNote,
} from '../infrastructure/clinical-document.repository.js';
import {
  findConsultationOf,
  type StoredConsultation,
} from '../infrastructure/consultation.repository.js';
import { CLINICAL_CLOCK } from './context.js';

const staleNote = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'The note changed elsewhere; reload it', { currentVersion });

const stateOf = (note: StoredNote | null): StoredNoteState | null =>
  note
    ? {
        status: note.status,
        signedVersionNo: note.signedVersionNo,
        hasDraft: note.draft !== null,
        version: note.version,
      }
    : null;

/** Two first saves at once: the unique note per consultation turns the second into STALE_RECORD. */
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

/** The signed-in doctor's own consultation; another doctor's reads as missing. */
async function ownConsultation(
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

async function toNote(
  tx: TenantTx,
  consultationId: string,
  note: StoredNote | null,
): Promise<ConsultationNote> {
  const names = await findStaffNames(tx, note?.versions.map((version) => version.signedBy) ?? []);
  return {
    consultationId,
    status: noteStatusOf(stateOf(note)),
    draft: note?.draft ?? null,
    draftSavedAt: note?.draftSavedAt?.toISOString() ?? null,
    amendReason: note?.amendReason ?? null,
    versions:
      note?.versions.map((version) => ({
        versionNo: version.versionNo,
        content: version.content,
        signedAt: version.signedAt.toISOString(),
        signedBy: names.get(version.signedBy) ?? '',
        amendReason: version.amendReason,
      })) ?? [],
    version: note?.version ?? 0,
  };
}

@Injectable()
export class ConsultationNoteService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  read(consultationId: string): Promise<ConsultationNote> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => {
      await ownConsultation(tx, scope, consultationId);
      return toNote(tx, consultationId, await findNoteOf(tx, consultationId));
    });
  }

  /** UC-CLI-01 step 2 and R1: the draft autosaves, so a crashed browser loses nothing. */
  async saveDraft(
    consultationId: string,
    request: SaveNoteDraftRequest,
  ): Promise<ConsultationNote> {
    const scope = requestScope();
    const at = this.clock.now();
    try {
      return await withTenant(this.prisma, scope, async (tx) => {
        const consultation = await ownConsultation(tx, scope, consultationId);
        const note = await findNoteOf(tx, consultationId);
        assertCanSaveDraft(stateOf(note), request.expectedVersion);
        if (!note) {
          await insertNote(tx, {
            tenantId: scope.tenantId,
            consultationId,
            visitId: consultation.visitId,
            patientId: consultation.patientId,
            authorUserId: scope.userId,
            draft: request.content,
            at,
          });
        } else {
          await this.change(tx, note, request.expectedVersion, at, {
            draft: request.content,
            draftSavedAt: at,
          });
        }
        return toNote(tx, consultationId, await findNoteOf(tx, consultationId));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw staleNote(1);
      throw error;
    }
  }

  /** UC-CLI-01 step 5: the draft becomes the next signed version; the consultation is CONSULTED. */
  sign(consultationId: string, request: NoteVersionRequest): Promise<ConsultationNote> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      await ownConsultation(tx, scope, consultationId);
      const note = await findNoteOf(tx, consultationId);
      assertCanSign(stateOf(note), request.expectedVersion, note?.draft ?? null);
      // assertCanSign refused a missing note or draft; this narrows the types for the compiler.
      if (!note?.draft) throw new DomainError('INVALID_TRANSITION', 'There is no draft to sign');
      const versionNo = note.signedVersionNo + 1;
      const previous = note.versions[0];
      await this.change(tx, note, request.expectedVersion, at, {
        status: 'SIGNED',
        signedVersionNo: versionNo,
        draft: null,
        draftSavedAt: null,
        amendReason: null,
      });
      await insertVersion(tx, {
        tenantId: scope.tenantId,
        documentId: note.documentId,
        versionNo,
        content: note.draft,
        signedBy: scope.userId,
        at,
        // FR-CLI-003: an amendment links to the version it amends, with its reason.
        amends: previous ? { versionId: previous.versionId, reason: note.amendReason ?? '' } : null,
      });
      await markConsulted(tx, consultationId, at);
      await recordChange(tx, scope, {
        action: 'clinical.note.signed',
        eventType: 'ConsultationSigned',
        targetType: 'clinical_document',
        targetId: note.documentId,
        details: { consultationId, versionNo, amended: previous !== undefined },
      });
      return toNote(tx, consultationId, await findNoteOf(tx, consultationId));
    });
  }

  /** UC-CLI-02: a new draft from the latest signed version, with the mandatory reason. */
  amend(consultationId: string, request: AmendNoteRequest): Promise<ConsultationNote> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      await ownConsultation(tx, scope, consultationId);
      const note = await findNoteOf(tx, consultationId);
      assertCanAmend(stateOf(note), request.expectedVersion);
      const latest = note?.versions[0];
      if (!note || !latest) throw new DomainError('NOT_FOUND', 'There is no signed note to amend');
      await this.change(tx, note, request.expectedVersion, at, {
        status: 'DRAFT',
        draft: latest.content,
        draftSavedAt: at,
        amendReason: request.reason,
      });
      await recordChange(tx, scope, {
        action: 'clinical.note.amendment_started',
        eventType: 'ConsultationNoteAmendmentStarted',
        targetType: 'clinical_document',
        targetId: note.documentId,
        details: { consultationId, amendsVersionNo: latest.versionNo },
      });
      return toNote(tx, consultationId, await findNoteOf(tx, consultationId));
    });
  }

  /** FR-CLI-003: an unsigned draft is discarded; an amendment's leaves the signed note as it was. */
  discard(consultationId: string, request: NoteVersionRequest): Promise<ConsultationNote> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      await ownConsultation(tx, scope, consultationId);
      const note = await findNoteOf(tx, consultationId);
      assertCanDiscard(stateOf(note), request.expectedVersion);
      if (!note) throw new DomainError('NOT_FOUND', 'There is no draft to discard');
      const signedBefore = note.signedVersionNo > 0;
      await this.change(tx, note, request.expectedVersion, at, {
        ...(signedBefore ? { status: 'SIGNED' as const } : {}),
        draft: null,
        draftSavedAt: null,
        amendReason: null,
      });
      await recordChange(tx, scope, {
        action: 'clinical.note.draft_discarded',
        eventType: 'ConsultationNoteDraftDiscarded',
        targetType: 'clinical_document',
        targetId: note.documentId,
        details: { consultationId, amendment: signedBefore },
      });
      return toNote(tx, consultationId, await findNoteOf(tx, consultationId));
    });
  }

  /** The version check decides a race between the read and the write (SP-03). */
  private async change(
    tx: TenantTx,
    note: StoredNote,
    expectedVersion: number,
    at: Date,
    change: NoteChange,
  ): Promise<void> {
    const changed = await updateNote(
      tx,
      { documentId: note.documentId, expectedVersion, at },
      change,
    );
    if (changed === 0) throw staleNote(expectedVersion + 1);
  }
}
