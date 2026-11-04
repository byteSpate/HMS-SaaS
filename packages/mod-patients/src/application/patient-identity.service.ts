// A patient's identity: read it for the screen, and correct it with a reason (T-PAT-04; UC-PAT-02;
// FR-PAT-008; SP-03; FR-AUD-001). A correction is one transaction: the new values, the next version,
// the history row with the previous values, the audit event and the outbox event.
import { Inject, Injectable } from '@nestjs/common';
import type { PatientDetail, PatientVersion, UpdatePatientIdentityRequest } from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { appendAuditEvent, appendOutboxEvent, PRISMA } from '@hms/platform';
import { correctionOf, type Correction } from '../domain/identity-correction.js';
import { fieldError } from '../domain/patient-identity.js';
import { NidVault, type SealedNid } from '../infrastructure/nid-vault.js';
import {
  applyCorrection,
  insertHistory,
  loadIdentity,
  saveNid,
  type StoredIdentity,
} from '../infrastructure/patient-identity.repository.js';
import { hospitalToday, PATIENTS_CLOCK, requestScope } from './context.js';
import { summaryOf } from './patient-view.js';

const notFound = () => new DomainError('NOT_FOUND', 'Patient not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this patient; reload it', {
    currentVersion,
  });

@Injectable()
export class PatientIdentityService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PATIENTS_CLOCK) private readonly clock: Clock,
    @Inject(NidVault) private readonly vault: NidVault,
  ) {}

  async detail(patientId: string): Promise<PatientDetail> {
    const scope = requestScope();
    const stored = await withTenant(this.prisma, scope, (tx) =>
      loadIdentity(tx, scope.tenantId, patientId),
    );
    if (!stored) throw notFound();
    return {
      ...summaryOf(stored, hospitalToday(this.clock)),
      birthDate: stored.birthDate,
      birthDatePrecision: stored.birthDatePrecision as PatientDetail['birthDatePrecision'],
      reportedAgeYears: stored.reportedAgeYears,
      reportedAgeOn: stored.reportedAgeOn,
      addressText: stored.addressText,
      version: stored.version,
    };
  }

  /**
   * The NID is compared by its keyed hash, so the stored number is never decrypted for this. A
   * changed NID keeps its previous sealed value and last four digits in the history.
   */
  private nidChange(stored: StoredIdentity, correction: Correction): SealedNid | null {
    if (correction.nid === null) return null;
    if (stored.nid && this.vault.lookupHash(correction.nid).equals(stored.nid.hash)) return null;
    correction.fields.push('nid');
    correction.previous.nid = stored.nid ? { last4: stored.nid.last4 } : null;
    return this.vault.seal(correction.nid);
  }

  correct(patientId: string, request: UpdatePatientIdentityRequest): Promise<PatientVersion> {
    const scope = requestScope();
    const today = hospitalToday(this.clock);
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await loadIdentity(tx, scope.tenantId, patientId);
      if (!stored) throw notFound();
      if (stored.version !== request.expectedVersion) throw stale(stored.version);

      const correction = correctionOf(stored, request.changes, today);
      const sealedNid = this.nidChange(stored, correction);
      if (correction.fields.length === 0) {
        throw fieldError('changes', 'Nothing differs from the current values');
      }

      const target = {
        tenantId: scope.tenantId,
        patientId,
        expectedVersion: request.expectedVersion,
      };
      // A concurrent correction may have won since the read; the version check decides.
      if ((await applyCorrection(tx, target, correction.columns)) === 0) {
        throw stale(request.expectedVersion + 1);
      }
      if (sealedNid) {
        await saveNid(
          tx,
          { ...target, createdBy: scope.userId, exists: stored.nid !== null },
          sealedNid,
        );
      }
      await insertHistory(tx, {
        tenantId: scope.tenantId,
        patientId,
        version: request.expectedVersion,
        changedFields: correction.fields,
        previousValues: correction.previous,
        previousNidCiphertext: sealedNid && stored.nid ? stored.nid.ciphertext : null,
        reason: request.reason,
        changedBy: scope.userId,
      });
      const version = request.expectedVersion + 1;
      // Field names only; the values stay in the patient and history rows.
      await appendAuditEvent(tx, {
        tenantId: scope.tenantId,
        action: 'patient.identity.changed',
        outcome: 'SUCCEEDED',
        actorUserId: scope.userId,
        ...(scope.membershipId ? { membershipId: scope.membershipId } : {}),
        targetType: 'patient',
        targetId: patientId,
        reason: request.reason,
        correlationId: scope.correlationId,
        details: {
          changedFields: correction.fields.join(','),
          fromVersion: version - 1,
          toVersion: version,
        },
      });
      await appendOutboxEvent(tx, {
        tenantId: scope.tenantId,
        eventType: 'PatientIdentityChanged',
        aggregateType: 'patient',
        aggregateId: patientId,
        payload: { patientId, version },
      });
      return { patientId, mrn: stored.mrn, version };
    });
  }
}
