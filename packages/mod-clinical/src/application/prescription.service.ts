// The prescription of a consultation (T-CLI-03; FR-CLI-001, FR-CLI-004..006; UC-CLI-01 steps 4
// and 5; UC-CLI-02; C-012, C-029, FPR-06; FR-AUD-001). Only the consultation's doctor reads or
// writes it. A draft save keeps each line with the medicine and labels as they are now, from the
// pharmacy module's catalogue; it is version-checked and not audited, like the note's autosave.
// Signing appends an immutable version and its prescription_line rows, audited, and emits
// PrescriptionSigned with the count of hospital-pharmacy lines for the pharmacy (Phase 4). It
// creates no stock movement and no charge (FR-CLI-001). A print renders the latest signed version
// and is audited; it changes nothing (FR-CLI-005). Each command is one transaction.
import { Inject, Injectable } from '@nestjs/common';
import {
  prescriptionContentSchema,
  type AmendPrescriptionRequest,
  type Prescription,
  type PrescriptionContent,
  type PrescriptionPrint,
  type PrescriptionVersionRequest,
  type PrintPrescriptionRequest,
  type SavePrescriptionDraftRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { calendarDateIn, DomainError, type Clock } from '@hms/domain-kernel';
import { findStaffNames, hospitalNamesOf } from '@hms/mod-identity-access';
import { findPatientRefs, findPractitionerPrintDetails } from '@hms/mod-patients';
import { findActiveMedicineChoices, findActiveTermChoices } from '@hms/mod-pharmacy';
import { findNextBookedDate } from '@hms/mod-scheduling';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import { renderPrescriptionHtml } from '@hms/print-templates';
import {
  assertCanAmendPrescription,
  assertCanDiscardPrescription,
  assertCanSavePrescriptionDraft,
  assertCanSignPrescription,
  assertStillActive,
  catalogueIdsOf,
  keptLinesOf,
  pharmacyLineCount,
  prescriptionStatusOf,
} from '../domain/prescription.js';
import {
  findDocumentOf,
  findNoteOf,
  insertDocument,
  insertVersion,
  type DocumentChange,
  type StoredDocument,
} from '../infrastructure/clinical-document.repository.js';
import { insertPrescriptionLines } from '../infrastructure/prescription-line.repository.js';
import {
  changeDocument,
  documentView,
  isUniqueViolation,
  ownConsultation,
  stateOf,
} from './clinical-documents.js';
import { CLINICAL_CLOCK, HOSPITAL_TIME_ZONE } from './context.js';
import { prescriptionPrintDataOf } from './prescription-print.js';

type StoredPrescription = StoredDocument<PrescriptionContent>;

const stalePrescription = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'The prescription changed elsewhere; reload it', {
    currentVersion,
  });

function findPrescriptionOf(tx: TenantTx, consultationId: string) {
  return findDocumentOf(tx, consultationId, 'PRESCRIPTION', (content) =>
    prescriptionContentSchema.parse(content),
  );
}

async function toPrescription(tx: TenantTx, consultationId: string): Promise<Prescription> {
  const prescription = await findPrescriptionOf(tx, consultationId);
  return documentView(tx, consultationId, prescription, prescriptionStatusOf);
}

@Injectable()
export class PrescriptionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  read(consultationId: string): Promise<Prescription> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => {
      await ownConsultation(tx, scope, consultationId);
      return toPrescription(tx, consultationId);
    });
  }

  /** UC-CLI-01 step 4 and R1: the draft autosaves, so a crashed browser loses nothing. */
  async saveDraft(
    consultationId: string,
    request: SavePrescriptionDraftRequest,
  ): Promise<Prescription> {
    const scope = requestScope();
    const at = this.clock.now();
    try {
      return await withTenant(this.prisma, scope, async (tx) => {
        const consultation = await ownConsultation(tx, scope, consultationId);
        const prescription = await findPrescriptionOf(tx, consultationId);
        assertCanSavePrescriptionDraft(stateOf(prescription), request.expectedVersion);
        const ids = catalogueIdsOf(request.lines);
        const draft: PrescriptionContent = {
          lines: keptLinesOf(request.lines, {
            medicines: await findActiveMedicineChoices(tx, ids.medicineIds),
            terms: await findActiveTermChoices(tx, ids.termIds),
          }),
        };
        if (!prescription) {
          await insertDocument(tx, {
            tenantId: scope.tenantId,
            kind: 'PRESCRIPTION',
            consultationId,
            visitId: consultation.visitId,
            patientId: consultation.patientId,
            authorUserId: scope.userId,
            draft,
            at,
          });
        } else {
          await this.change(tx, prescription, request.expectedVersion, at, {
            draft,
            draftSavedAt: at,
          });
        }
        return toPrescription(tx, consultationId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw stalePrescription(1);
      throw error;
    }
  }

  /** UC-CLI-01 step 5: the draft becomes the next signed version with its lines. */
  sign(consultationId: string, request: PrescriptionVersionRequest): Promise<Prescription> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const consultation = await ownConsultation(tx, scope, consultationId);
      const prescription = await findPrescriptionOf(tx, consultationId);
      const draft = prescription?.draft ?? null;
      assertCanSignPrescription(stateOf(prescription), request.expectedVersion, draft);
      // assertCanSignPrescription refused a missing prescription or draft; this narrows the types.
      if (!prescription || !draft) {
        throw new DomainError('INVALID_TRANSITION', 'There is no draft to sign');
      }
      const active = await findActiveMedicineChoices(
        tx,
        draft.lines.map((line) => line.medicineId),
      );
      assertStillActive(draft, new Set(active.keys()));
      const versionNo = prescription.signedVersionNo + 1;
      const previous = prescription.versions[0];
      await this.change(tx, prescription, request.expectedVersion, at, {
        status: 'SIGNED',
        signedVersionNo: versionNo,
        draft: null,
        draftSavedAt: null,
        amendReason: null,
      });
      const versionId = await insertVersion(tx, {
        tenantId: scope.tenantId,
        documentId: prescription.documentId,
        versionNo,
        content: draft,
        signedBy: scope.userId,
        at,
        // FR-CLI-003: an amendment links to the version it amends, with its reason.
        amends: previous
          ? { versionId: previous.versionId, reason: prescription.amendReason ?? '' }
          : null,
      });
      await insertPrescriptionLines(tx, {
        tenantId: scope.tenantId,
        documentVersionId: versionId,
        patientId: consultation.patientId,
        lines: draft.lines,
        at,
      });
      await recordChange(tx, scope, {
        action: 'clinical.prescription.signed',
        eventType: 'PrescriptionSigned',
        targetType: 'clinical_document',
        targetId: prescription.documentId,
        details: {
          consultationId,
          versionNo,
          documentVersionId: versionId,
          lineCount: draft.lines.length,
          pharmacyLineCount: pharmacyLineCount(draft),
          amended: previous !== undefined,
        },
      });
      return toPrescription(tx, consultationId);
    });
  }

  /** UC-CLI-02: a new draft from the latest signed version, with the mandatory reason. */
  amend(consultationId: string, request: AmendPrescriptionRequest): Promise<Prescription> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      await ownConsultation(tx, scope, consultationId);
      const prescription = await findPrescriptionOf(tx, consultationId);
      assertCanAmendPrescription(stateOf(prescription), request.expectedVersion);
      const latest = prescription?.versions[0];
      if (!prescription || !latest) {
        throw new DomainError('NOT_FOUND', 'There is no signed prescription to amend');
      }
      await this.change(tx, prescription, request.expectedVersion, at, {
        status: 'DRAFT',
        draft: latest.content,
        draftSavedAt: at,
        amendReason: request.reason,
      });
      await recordChange(tx, scope, {
        action: 'clinical.prescription.amendment_started',
        eventType: 'PrescriptionAmendmentStarted',
        targetType: 'clinical_document',
        targetId: prescription.documentId,
        details: { consultationId, amendsVersionNo: latest.versionNo },
      });
      return toPrescription(tx, consultationId);
    });
  }

  /** FR-CLI-003: an unsigned draft is discarded; an amendment's leaves the signed one as it was. */
  discard(consultationId: string, request: PrescriptionVersionRequest): Promise<Prescription> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      await ownConsultation(tx, scope, consultationId);
      const prescription = await findPrescriptionOf(tx, consultationId);
      assertCanDiscardPrescription(stateOf(prescription), request.expectedVersion);
      if (!prescription) throw new DomainError('NOT_FOUND', 'There is no draft to discard');
      const signedBefore = prescription.signedVersionNo > 0;
      await this.change(tx, prescription, request.expectedVersion, at, {
        ...(signedBefore ? { status: 'SIGNED' as const } : {}),
        draft: null,
        draftSavedAt: null,
        amendReason: null,
      });
      await recordChange(tx, scope, {
        action: 'clinical.prescription.draft_discarded',
        eventType: 'PrescriptionDraftDiscarded',
        targetType: 'clinical_document',
        targetId: prescription.documentId,
        details: { consultationId, amendment: signedBefore },
      });
      return toPrescription(tx, consultationId);
    });
  }

  /** FR-CLI-005: the latest signed version as a printable page; printing changes nothing. */
  print(consultationId: string, request: PrintPrescriptionRequest): Promise<PrescriptionPrint> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => {
      const consultation = await ownConsultation(tx, scope, consultationId);
      const prescription = await findPrescriptionOf(tx, consultationId);
      const latest = prescription?.versions[0];
      if (!prescription || !latest) {
        throw new DomainError('INVALID_TRANSITION', 'Sign the prescription before printing it');
      }
      const [doctor, patients, names, note, hospital, nextVisit] = await Promise.all([
        findPractitionerPrintDetails(tx, consultation.practitionerId),
        findPatientRefs(tx, [consultation.patientId]),
        findStaffNames(tx, [latest.signedBy]),
        findNoteOf(tx, consultationId),
        hospitalNamesOf(tx, scope.tenantId),
        findNextBookedDate(tx, {
          patientId: consultation.patientId,
          practitionerId: consultation.practitionerId,
          afterDate: calendarDateIn(consultation.startedAt, HOSPITAL_TIME_ZONE),
        }),
      ]);
      const patient = patients.get(consultation.patientId);
      if (!doctor || !patient) throw new DomainError('NOT_FOUND', 'Consultation not found');
      const html = renderPrescriptionHtml(
        prescriptionPrintDataOf({
          hospital,
          doctor,
          patient,
          version: { ...latest, signedBy: names.get(latest.signedBy) ?? '' },
          note: note?.versions[0]?.content ?? null,
          nextVisit,
        }),
        request.language,
      );
      await recordChange(tx, scope, {
        action: 'clinical.prescription.printed',
        eventType: 'PrescriptionPrinted',
        targetType: 'clinical_document',
        targetId: prescription.documentId,
        details: { consultationId, versionNo: latest.versionNo, language: request.language },
      });
      return { versionNo: latest.versionNo, html };
    });
  }

  private change(
    tx: TenantTx,
    prescription: StoredPrescription,
    expectedVersion: number,
    at: Date,
    change: DocumentChange,
  ): Promise<void> {
    return changeDocument(
      tx,
      { document: prescription, expectedVersion, at },
      change,
      stalePrescription,
    );
  }
}
