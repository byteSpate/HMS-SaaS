// A doctor's sessions of one day with their patients (T-CLI-01; FR-CLI-002; SCR-08). Called by the
// clinical module for the doctor's worklist: the published sessions of the date, in time order,
// each with its appointments that are still booked or already checked in. Cancelled, rescheduled
// and no-show appointments are not on the worklist. Runs in the caller's withTenant() transaction.
import type { TenantTx } from '@hms/database';

export interface DayAppointment {
  appointmentId: string;
  patientId: string;
  /** BOOKED (the patient is expected) or CHECKED_IN (the visit exists). */
  status: 'BOOKED' | 'CHECKED_IN';
  bookedAt: Date;
}

export interface DaySession {
  sessionId: string;
  startsAt: Date;
  endsAt: Date;
  appointments: DayAppointment[];
}

const ON_WORKLIST = ['BOOKED', 'CHECKED_IN'];

/** `sessionDate` is the hospital's calendar date, YYYY-MM-DD. */
export async function listDaySessionsOf(
  tx: TenantTx,
  practitionerId: string,
  sessionDate: string,
): Promise<DaySession[]> {
  const rows = await tx.scheduleSession.findMany({
    where: { practitionerId, sessionDate: new Date(sessionDate), status: 'PUBLISHED' },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      appointments: {
        where: { status: { in: ON_WORKLIST } },
        select: { id: true, patientId: true, status: true, bookedAt: true },
        orderBy: [{ bookedAt: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => ({
    sessionId: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    appointments: row.appointments.map((appointment) => ({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      status: appointment.status as DayAppointment['status'],
      bookedAt: appointment.bookedAt,
    })),
  }));
}
