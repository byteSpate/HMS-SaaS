// Appointment rows in PostgreSQL (T-SCH-02; E section 5.3). Every function runs in the caller's
// withTenant() transaction, so RLS limits it to one hospital (ADR-003). The patient, session and
// practitioner are read through the row's foreign keys, which RLS also limits to the hospital.
import type { Appointment, AppointmentListQuery, AppointmentStatus } from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import { wallClockTimeIn } from '@hms/domain-kernel';
import {
  dateOf,
  PRACTITIONER_CHOICE,
  toPractitionerChoice,
} from './schedule-session.repository.js';

const COLUMNS = {
  id: true,
  status: true,
  rescheduledFromId: true,
  cancelReason: true,
  bookedAt: true,
  version: true,
  patient: { select: { id: true, mrn: true, nameBn: true, nameEn: true } },
  scheduleSession: {
    select: {
      id: true,
      sessionDate: true,
      startsAt: true,
      endsAt: true,
      practitioner: PRACTITIONER_CHOICE,
    },
  },
} as const;

type Row = NonNullable<Awaited<ReturnType<typeof findRow>>>;

const findRow = (tx: TenantTx, appointmentId: string) =>
  tx.appointment.findUnique({ where: { id: appointmentId }, select: COLUMNS });

function toAppointment(row: Row, timeZone: string): Appointment {
  const session = row.scheduleSession;
  return {
    appointmentId: row.id,
    patient: {
      patientId: row.patient.id,
      mrn: row.patient.mrn,
      nameBn: row.patient.nameBn,
      nameEn: row.patient.nameEn,
    },
    session: {
      sessionId: session.id,
      practitioner: toPractitionerChoice(session.practitioner),
      sessionDate: dateOf(session.sessionDate),
      startTime: wallClockTimeIn(session.startsAt, timeZone),
      endTime: wallClockTimeIn(session.endsAt, timeZone),
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
    },
    status: row.status as AppointmentStatus,
    rescheduledFromId: row.rescheduledFromId,
    cancelReason: row.cancelReason,
    bookedAt: row.bookedAt.toISOString(),
    version: row.version,
  };
}

/** What a change compares: the status, version, session and its end. */
export interface StoredAppointment {
  status: AppointmentStatus;
  version: number;
  patientId: string;
  sessionId: string;
  sessionEndsAt: Date;
  /** The session's hospital date, YYYY-MM-DD (check-in happens on it, UC-VIS-01). */
  sessionDate: string;
  practitionerId: string;
}

/** A session's bookings in booking order, or a patient's appointments in session order. */
export async function listAppointments(
  tx: TenantTx,
  query: AppointmentListQuery,
  timeZone: string,
): Promise<Appointment[]> {
  const rows = await tx.appointment.findMany({
    where: query.sessionId
      ? { scheduleSessionId: query.sessionId }
      : { patientId: query.patientId ?? '' },
    select: COLUMNS,
    orderBy: [{ scheduleSession: { startsAt: 'asc' } }, { bookedAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => toAppointment(row, timeZone));
}

export async function findAppointment(
  tx: TenantTx,
  appointmentId: string,
  timeZone: string,
): Promise<Appointment | null> {
  const row = await findRow(tx, appointmentId);
  return row ? toAppointment(row, timeZone) : null;
}

export async function findStoredAppointment(
  tx: TenantTx,
  appointmentId: string,
): Promise<StoredAppointment | null> {
  const row = await tx.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      status: true,
      version: true,
      patientId: true,
      scheduleSessionId: true,
      scheduleSession: { select: { endsAt: true, sessionDate: true, practitionerId: true } },
    },
  });
  return row
    ? {
        status: row.status as AppointmentStatus,
        version: row.version,
        patientId: row.patientId,
        sessionId: row.scheduleSessionId,
        sessionEndsAt: row.scheduleSession.endsAt,
        sessionDate: dateOf(row.scheduleSession.sessionDate),
        practitionerId: row.scheduleSession.practitionerId,
      }
    : null;
}

/** Whether the patient already holds a live booking in the session (a double entry). */
export async function hasLiveBooking(
  tx: TenantTx,
  patientId: string,
  sessionId: string,
): Promise<boolean> {
  const row = await tx.appointment.findFirst({
    where: { patientId, scheduleSessionId: sessionId, status: 'BOOKED' },
    select: { id: true },
  });
  return row !== null;
}

/** The session's status and end, to say why a place could not be taken. */
export function findSessionForBooking(
  tx: TenantTx,
  sessionId: string,
): Promise<{ status: string; endsAt: Date } | null> {
  return tx.scheduleSession.findUnique({
    where: { id: sessionId },
    select: { status: true, endsAt: true },
  });
}

export async function insertAppointment(
  tx: TenantTx,
  values: {
    tenantId: string;
    patientId: string;
    sessionId: string;
    userId: string;
    at: Date;
    rescheduledFromId?: string;
  },
  timeZone: string,
): Promise<Appointment> {
  const row = await tx.appointment.create({
    data: {
      tenantId: values.tenantId,
      patientId: values.patientId,
      scheduleSessionId: values.sessionId,
      rescheduledFromId: values.rescheduledFromId ?? null,
      bookedAt: values.at,
      bookedBy: values.userId,
      updatedAt: values.at,
      updatedBy: values.userId,
    },
    select: COLUMNS,
  });
  return toAppointment(row, timeZone);
}

/**
 * Sets the status (and a cancellation's reason) only if the row is still BOOKED at
 * `expectedVersion` (SP-03). Returns the number of rows changed: 0 means another change won.
 */
export async function updateAppointmentStatus(
  tx: TenantTx,
  target: { appointmentId: string; expectedVersion: number; userId: string; at: Date },
  change: { status: AppointmentStatus; cancelReason?: string },
): Promise<number> {
  const result = await tx.appointment.updateMany({
    where: { id: target.appointmentId, version: target.expectedVersion, status: 'BOOKED' },
    data: {
      status: change.status,
      cancelReason: change.cancelReason ?? null,
      updatedBy: target.userId,
      updatedAt: target.at,
      version: { increment: 1 },
    },
  });
  return result.count;
}
