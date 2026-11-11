// The scheduling half of check-in (T-VIS-01; UC-VIS-01; FR-VIS-002, FR-SCH-004; C-035, C-007).
// Called by the clinical module inside its check-in transaction: the appointment becomes
// CHECKED_IN and the patient gets the session's next serial number. The version check makes two
// concurrent check-ins with different keys end in one success and one STALE_RECORD (R2).
import type { TenantTx } from '@hms/database';
import { calendarDateIn } from '@hms/domain-kernel';
import { recordChange, type Scope } from '@hms/platform';
import { appointmentNotFound, assertCheckIn, staleAppointment } from '../domain/appointment.js';
import {
  findStoredAppointment,
  updateAppointmentStatus,
} from '../infrastructure/appointment.repository.js';
import { takeQueueNumber } from '../infrastructure/schedule-session.repository.js';
import { HOSPITAL_TIME_ZONE } from './context.js';

export interface CheckedInAppointment {
  appointmentId: string;
  patientId: string;
  practitionerId: string;
  sessionId: string;
  /** C-035: the serial number in the doctor's queue for the session, in check-in order. */
  queueNumber: number;
}

export async function checkInAppointment(
  tx: TenantTx,
  scope: Scope,
  request: { appointmentId: string; expectedVersion: number },
  at: Date,
): Promise<CheckedInAppointment> {
  // RLS hides another hospital's appointment, so it reads as missing (UC-VIS-01 D2).
  const stored = await findStoredAppointment(tx, request.appointmentId);
  if (!stored) throw appointmentNotFound();
  if (stored.version !== request.expectedVersion) throw staleAppointment(stored.version);
  assertCheckIn(stored.status, stored.sessionDate, calendarDateIn(at, HOSPITAL_TIME_ZONE));
  // The UPDATE locks the appointment row first, so the serial number is taken once per check-in.
  const changed = await updateAppointmentStatus(
    tx,
    { ...request, userId: scope.userId, at },
    { status: 'CHECKED_IN' },
  );
  if (changed === 0) throw staleAppointment(request.expectedVersion + 1);
  const queueNumber = await takeQueueNumber(tx, stored.sessionId);
  await recordChange(tx, scope, {
    action: 'scheduling.appointment.checked_in',
    eventType: 'AppointmentChanged',
    targetType: 'appointment',
    targetId: request.appointmentId,
    details: {
      sessionId: stored.sessionId,
      status: 'CHECKED_IN',
      queueNumber,
      toVersion: request.expectedVersion + 1,
    },
  });
  return {
    appointmentId: request.appointmentId,
    patientId: stored.patientId,
    practitionerId: stored.practitionerId,
    sessionId: stored.sessionId,
    queueNumber,
  };
}
