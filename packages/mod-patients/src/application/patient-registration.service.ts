// Register a patient after reviewing duplicate candidates (T-PAT-01; UC-PAT-01; FR-PAT-001, -002,
// -005, -006, -009, -011; C-033, C-034; FR-AUD-001). One command is one transaction: the MRN, the
// patient, the audit event, the outbox event and the idempotency record commit together.
import { Inject, Injectable } from '@nestjs/common';
import type {
  DuplicateCandidate,
  DuplicateCandidatesRequest,
  RegisteredPatient,
  RegisterPatientRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { calendarDateIn, DomainError, type Clock } from '@hms/domain-kernel';
import {
  allocateBusinessNumber,
  appendAuditEvent,
  appendOutboxEvent,
  getEffectivePolicy,
  getRequestContext,
  PRISMA,
} from '@hms/platform';
import { assertCandidatesConfirmed } from '../domain/duplicate-policy.js';
import { identityFactsOf, type IdentityFacts } from '../domain/patient-identity.js';
import {
  findDuplicateCandidates,
  insertPatient,
  type CandidateProbe,
} from '../infrastructure/patient.repository.js';

export const PATIENTS_CLOCK = Symbol('PATIENTS_CLOCK');

// C-024: one facility per hospital for now, and every pilot hospital is in Bangladesh. When a
// hospital can have facilities in other zones, read facility.timezone here instead.
const HOSPITAL_TIME_ZONE = 'Asia/Dhaka';
// C-033: {PREFIX}-{seq:6}, continuous. Until a hospital publishes its prefix (numbering policy),
// MRNs use MRN, as in the plan's examples, so registration never waits for configuration.
const MRN_PATTERN = '{PREFIX}-{seq:6}';
const DEFAULT_MRN_PREFIX = 'MRN';

interface Scope {
  tenantId: string;
  userId: string;
  membershipId?: string;
  correlationId: string;
}

function requestScope(): Scope {
  const context = getRequestContext();
  if (!context?.tenantId || !context.userId) {
    throw new DomainError('TENANT_NOT_SELECTED', 'Choose a hospital first');
  }
  return { ...context, tenantId: context.tenantId, userId: context.userId };
}

function probeOf(facts: IdentityFacts, sex: CandidateProbe['sex']): CandidateProbe {
  return {
    nameBn: facts.nameBn,
    nameEn: facts.nameEn,
    sex,
    birthYear: facts.birthYear,
    phoneNormalized: facts.phoneNormalized,
  };
}

async function nextMrn(tx: TenantTx, tenantId: string, now: Date): Promise<string> {
  const numbering = await getEffectivePolicy(tx, 'numbering', now);
  return allocateBusinessNumber(tx, {
    tenantId,
    sequenceKey: 'MRN',
    pattern: MRN_PATTERN,
    prefix: numbering?.mrnPrefix ?? DEFAULT_MRN_PREFIX,
  });
}

@Injectable()
export class PatientRegistrationService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PATIENTS_CLOCK) private readonly clock: Clock,
  ) {}

  private today(): string {
    return calendarDateIn(this.clock.now(), HOSPITAL_TIME_ZONE);
  }

  /** UC-PAT-01 step 3: the possible existing patients for what the receptionist has typed. */
  findCandidates(request: DuplicateCandidatesRequest): Promise<DuplicateCandidate[]> {
    const scope = requestScope();
    const probe = probeOf(identityFactsOf(request, this.today()), request.sex);
    return withTenant(this.prisma, scope, (tx) =>
      findDuplicateCandidates(tx, scope.tenantId, probe),
    );
  }

  register(request: RegisterPatientRequest): Promise<RegisteredPatient> {
    const scope = requestScope();
    const now = this.clock.now();
    const facts = identityFactsOf(request, calendarDateIn(now, HOSPITAL_TIME_ZONE));
    return withTenant(this.prisma, scope, async (tx) => {
      // Checked again inside the command, so a candidate registered meanwhile is not missed.
      const candidates = await findDuplicateCandidates(
        tx,
        scope.tenantId,
        probeOf(facts, request.sex),
      );
      assertCandidatesConfirmed(
        candidates.map((candidate) => candidate.patientId),
        request,
      );

      const created = await insertPatient(tx, {
        ...facts,
        tenantId: scope.tenantId,
        mrn: await nextMrn(tx, scope.tenantId, now),
        sex: request.sex,
        addressText: request.addressText ?? null,
        createdBy: scope.userId,
      });
      // Audit details hold IDs and codes only; the names stay in the patient row.
      await appendAuditEvent(tx, {
        tenantId: scope.tenantId,
        action: 'patient.registered',
        outcome: 'SUCCEEDED',
        actorUserId: scope.userId,
        ...(scope.membershipId ? { membershipId: scope.membershipId } : {}),
        targetType: 'patient',
        targetId: created.id,
        correlationId: scope.correlationId,
        details: {
          mrn: created.mrn,
          candidatesShown: request.shownCandidateIds.length,
          shownCandidateIds: request.shownCandidateIds.join(','),
          confirmedDespiteCandidates: candidates.length > 0,
        },
      });
      await appendOutboxEvent(tx, {
        tenantId: scope.tenantId,
        eventType: 'PatientRegistered',
        aggregateType: 'patient',
        aggregateId: created.id,
        payload: { patientId: created.id },
      });
      return { patientId: created.id, mrn: created.mrn, version: created.version };
    });
  }
}
