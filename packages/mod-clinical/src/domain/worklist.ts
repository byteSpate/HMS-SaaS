// The doctor worklist's rules (T-CLI-01; FR-CLI-002; UC-CLI-01 step 1; C-009, C-011; SP-03). Pure:
// the status of a patient on the worklist, the queue order, and whether the signed-in doctor may
// start the consultation of a visit. The service reads the facts; these functions decide.
import type { WorklistStatus } from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';

/** The doctor fee as billing reports it; NONE when no fee was issued (UC-VIS-01 A1). */
export type DoctorFeeState = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'NONE';

export type ConsultationStatus = 'IN_CONSULTATION' | 'CONSULTED';

export interface EntryFacts {
  checkedIn: boolean;
  consultation: ConsultationStatus | null;
  doctorFee: DoctorFeeState;
}

/**
 * FR-CLI-002. WAITING_PAYMENT and WAITING follow the doctor fee's eligibility (C-011). With no fee
 * issued there is nothing to pay, so the patient waits for the doctor (interim, as check-in lets
 * the visit exist without a fee).
 */
export function worklistStatusOf(facts: EntryFacts): WorklistStatus {
  if (!facts.checkedIn) return 'EXPECTED';
  if (facts.consultation) return facts.consultation;
  return facts.doctorFee === 'NOT_ELIGIBLE' ? 'WAITING_PAYMENT' : 'WAITING';
}

/** C-035: checked-in patients by serial number, then the expected ones by booking time. */
export function byQueueOrder(
  a: { queueNumber: number | null; bookedAt: Date },
  b: { queueNumber: number | null; bookedAt: Date },
): number {
  if (a.queueNumber !== null && b.queueNumber !== null) return a.queueNumber - b.queueNumber;
  if (a.queueNumber !== null) return -1;
  if (b.queueNumber !== null) return 1;
  return a.bookedAt.getTime() - b.bookedAt.getTime();
}

export interface StartFacts {
  visit: {
    kind: string;
    status: string;
    attendingPractitionerId: string | null;
    version: number;
  };
  /** The practitioner linked to the signed-in account (FR-PRA-003), or null. */
  doctorPractitionerId: string | null;
  expectedVersion: number;
  consultationExists: boolean;
  doctorFee: DoctorFeeState;
}

/** UC-CLI-01 preconditions, in the order a doctor can act on them. */
export function assertCanStart(facts: StartFacts): void {
  const { visit } = facts;
  // A covering doctor is not configured yet (UC-CLI-01 precondition), so only the visit's doctor.
  if (
    facts.doctorPractitionerId === null ||
    facts.doctorPractitionerId !== visit.attendingPractitionerId
  ) {
    throw new DomainError(
      'PERMISSION_DENIED',
      "Only the visit's doctor can start this consultation",
    );
  }
  if (visit.kind !== 'OPD_CONSULTATION' || visit.status !== 'OPEN') {
    throw new DomainError('INVALID_TRANSITION', 'This visit is not an open OPD consultation');
  }
  if (visit.version !== facts.expectedVersion) {
    throw new DomainError('STALE_RECORD', 'This patient changed; reload the worklist', {
      currentVersion: visit.version,
    });
  }
  if (facts.consultationExists) {
    throw new DomainError('INVALID_TRANSITION', 'This consultation has already started');
  }
  if (facts.doctorFee === 'NOT_ELIGIBLE') {
    throw new DomainError('PAYMENT_NOT_ELIGIBLE', 'The doctor fee is not paid yet');
  }
}
