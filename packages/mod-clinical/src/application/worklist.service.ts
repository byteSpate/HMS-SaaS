// The doctor worklist and the start of a consultation (T-CLI-01; FR-CLI-002; UC-CLI-01 step 1;
// SCR-08; C-009, C-011; FR-PRA-003; FR-AUD-001). The worklist is today's published sessions of the
// practitioner linked to the signed-in account, with each booked or checked-in patient and their
// status: the appointment (scheduling), the visit and consultation (this module) and the doctor
// fee's eligibility (billing) are read in one transaction. Starting a consultation, in one
// transaction: the start checks (domain), the visit's version (SP-03), the consultation row, and
// the audit and outbox pair.
import { Inject, Injectable } from '@nestjs/common';
import type {
  Consultation,
  DoctorWorklist,
  StartConsultationRequest,
  WorklistEntry,
  WorklistSession,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { calendarDateIn, DomainError, wallClockTimeIn, type Clock } from '@hms/domain-kernel';
import { doctorFeeEligibilityOf } from '@hms/mod-billing';
import {
  findPatientRefs,
  findPractitionerChoices,
  findPractitionerIdOfAccount,
} from '@hms/mod-patients';
import { listDaySessionsOf, type DaySession } from '@hms/mod-scheduling';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import {
  assertCanStart,
  byQueueOrder,
  worklistStatusOf,
  type DoctorFeeState,
} from '../domain/worklist.js';
import {
  bumpVisitVersion,
  findConsultationOf,
  findStartableVisit,
  findVisitsOfAppointments,
  insertConsultation,
  type StoredConsultation,
} from '../infrastructure/consultation.repository.js';
import { CLINICAL_CLOCK, HOSPITAL_TIME_ZONE } from './context.js';

const consultationNotFound = () => new DomainError('NOT_FOUND', 'Consultation not found');
const staleVisit = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'This patient changed; reload the worklist', { currentVersion });

async function doctorFeesOf(
  tx: TenantTx,
  visitIds: readonly string[],
): Promise<(visitId: string) => DoctorFeeState> {
  const fees = await doctorFeeEligibilityOf(tx, visitIds);
  return (visitId) => fees.get(visitId) ?? 'NONE';
}

/** Each session's patients with their status, in queue order. */
async function sessionsWithEntries(
  tx: TenantTx,
  sessions: DaySession[],
): Promise<WorklistSession[]> {
  const appointments = sessions.flatMap((session) => session.appointments);
  const visits = await findVisitsOfAppointments(
    tx,
    appointments.map((appointment) => appointment.appointmentId),
  );
  const [patients, feeOf] = await Promise.all([
    findPatientRefs(
      tx,
      appointments.map((appointment) => appointment.patientId),
    ),
    doctorFeesOf(
      tx,
      [...visits.values()].map((visit) => visit.visitId),
    ),
  ]);
  return sessions.map((session) => {
    const rows = session.appointments.flatMap((appointment) => {
      const patient = patients.get(appointment.patientId);
      const visit = visits.get(appointment.appointmentId) ?? null;
      // A CHECKED_IN appointment whose visit was cancelled is off the worklist.
      if (!patient || (appointment.status === 'CHECKED_IN' && !visit)) return [];
      const entry: WorklistEntry = {
        appointmentId: appointment.appointmentId,
        patient,
        status: worklistStatusOf({
          checkedIn: visit !== null,
          consultation: visit?.consultation?.status ?? null,
          doctorFee: visit ? feeOf(visit.visitId) : 'NONE',
        }),
        visitId: visit?.visitId ?? null,
        visitVersion: visit?.version ?? null,
        queueNumber: visit?.queueNumber ?? null,
        arrivedAt: visit?.arrivedAt.toISOString() ?? null,
        consultationId: visit?.consultation?.consultationId ?? null,
      };
      return [{ entry, queueNumber: entry.queueNumber, bookedAt: appointment.bookedAt }];
    });
    return {
      sessionId: session.sessionId,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      startTime: wallClockTimeIn(session.startsAt, HOSPITAL_TIME_ZONE),
      endTime: wallClockTimeIn(session.endsAt, HOSPITAL_TIME_ZONE),
      entries: rows.sort(byQueueOrder).map(({ entry }) => entry),
    };
  });
}

async function toConsultation(tx: TenantTx, stored: StoredConsultation): Promise<Consultation> {
  const patient = (await findPatientRefs(tx, [stored.patientId])).get(stored.patientId);
  if (!patient) throw consultationNotFound();
  return {
    consultationId: stored.consultationId,
    visitId: stored.visitId,
    patient,
    status: stored.status,
    startedAt: stored.startedAt.toISOString(),
    version: stored.version,
  };
}

@Injectable()
export class WorklistService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLINICAL_CLOCK) private readonly clock: Clock,
  ) {}

  /** FR-CLI-002: today's worklist of the signed-in doctor; empty when the account is unlinked. */
  today(): Promise<DoctorWorklist> {
    const scope = requestScope();
    const date = calendarDateIn(this.clock.now(), HOSPITAL_TIME_ZONE);
    return withTenant(this.prisma, scope, async (tx) => {
      const practitionerId = await findPractitionerIdOfAccount(tx, scope.userId);
      if (!practitionerId) return { date, practitioner: null, sessions: [] };
      const practitioner =
        (await findPractitionerChoices(tx, [practitionerId])).get(practitionerId) ?? null;
      const sessions = await listDaySessionsOf(tx, practitionerId, date);
      return { date, practitioner, sessions: await sessionsWithEntries(tx, sessions) };
    });
  }

  /** UC-CLI-01 step 1. D1: an unpaid doctor fee is PAYMENT_NOT_ELIGIBLE (C-011). */
  start(visitId: string, request: StartConsultationRequest): Promise<Consultation> {
    const scope = requestScope();
    const at = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      // RLS hides another hospital's visit, so it reads as missing.
      const visit = await findStartableVisit(tx, visitId);
      if (!visit) throw new DomainError('NOT_FOUND', 'Visit not found');
      const practitionerId = await findPractitionerIdOfAccount(tx, scope.userId);
      const feeOf = await doctorFeesOf(tx, [visitId]);
      assertCanStart({
        visit,
        doctorPractitionerId: practitionerId,
        expectedVersion: request.expectedVersion,
        consultationExists: visit.consultationExists,
        doctorFee: feeOf(visitId),
      });
      // assertCanStart refused an unlinked account; this narrows the type for the compiler.
      if (!practitionerId) throw new DomainError('PERMISSION_DENIED', 'Account not linked');
      const target = { visitId, expectedVersion: request.expectedVersion, at };
      if ((await bumpVisitVersion(tx, target)) === 0) {
        throw staleVisit(request.expectedVersion + 1);
      }
      const consultation = await insertConsultation(tx, {
        tenantId: scope.tenantId,
        visitId,
        practitionerId,
        userId: scope.userId,
        at,
      });
      await recordChange(tx, scope, {
        action: 'clinical.consultation.started',
        eventType: 'ConsultationStarted',
        targetType: 'consultation',
        targetId: consultation.consultationId,
        details: { visitId, practitionerId, visitVersion: request.expectedVersion + 1 },
      });
      return toConsultation(tx, consultation);
    });
  }

  /** The signed-in doctor's own consultation; another doctor's reads as missing. */
  consultation(consultationId: string): Promise<Consultation> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => {
      const practitionerId = await findPractitionerIdOfAccount(tx, scope.userId);
      const stored = practitionerId
        ? await findConsultationOf(tx, consultationId, practitionerId)
        : null;
      if (!stored) throw consultationNotFound();
      return toConsultation(tx, stored);
    });
  }
}
