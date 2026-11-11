// Schedule session rows in PostgreSQL (T-SCH-01; E section 5.3). Every function runs in the
// caller's withTenant() transaction, so RLS limits it to one hospital (ADR-003). The practitioner
// is read through the row's foreign key, which RLS also limits to the hospital.
import type {
  PractitionerChoice,
  ScheduleSession,
  ScheduleSessionListQuery,
  ScheduleSessionStatus,
} from '@hms/contracts';
import type { TenantTx } from '@hms/database';
import { wallClockTimeIn } from '@hms/domain-kernel';
import type { SessionStatus, SessionTimes } from '../domain/schedule-session.js';

/** The practitioner as session and appointment views show them, read through the FK. */
export const PRACTITIONER_CHOICE = {
  select: {
    id: true,
    nameBn: true,
    nameEn: true,
    specialty: true,
    department: { select: { id: true, code: true, nameBn: true, nameEn: true } },
  },
} as const;

interface PractitionerRow {
  id: string;
  nameBn: string | null;
  nameEn: string | null;
  specialty: string | null;
  department: { id: string; code: string; nameBn: string | null; nameEn: string | null } | null;
}

export function toPractitionerChoice(practitioner: PractitionerRow): PractitionerChoice {
  return {
    practitionerId: practitioner.id,
    nameBn: practitioner.nameBn,
    nameEn: practitioner.nameEn,
    specialty: practitioner.specialty,
    department: practitioner.department
      ? {
          departmentId: practitioner.department.id,
          code: practitioner.department.code,
          nameBn: practitioner.department.nameBn,
          nameEn: practitioner.department.nameEn,
        }
      : null,
  };
}

const COLUMNS = {
  id: true,
  sessionDate: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  bookedCount: true,
  status: true,
  version: true,
  practitioner: PRACTITIONER_CHOICE,
} as const;

interface Row {
  id: string;
  sessionDate: Date;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookedCount: number;
  status: string;
  version: number;
  practitioner: PractitionerRow;
}

/** What a status change compares: the current status, bookings, end and version. */
export interface StoredSession {
  status: SessionStatus;
  bookedCount: number;
  endsAt: Date;
  version: number;
}

/** A DATE column arrives as midnight UTC; its first ten characters are the calendar date. */
export const dateOf = (value: Date) => value.toISOString().slice(0, 10);

function toSession(row: Row, timeZone: string): ScheduleSession {
  return {
    sessionId: row.id,
    practitioner: toPractitionerChoice(row.practitioner),
    sessionDate: dateOf(row.sessionDate),
    startTime: wallClockTimeIn(row.startsAt, timeZone),
    endTime: wallClockTimeIn(row.endsAt, timeZone),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    capacity: row.capacity,
    bookedCount: row.bookedCount,
    status: row.status as ScheduleSessionStatus,
    version: row.version,
  };
}

/**
 * Sessions from `from` to `to` (dates included), in time order, the order a calendar shows. With
 * `bookableAt`, only published sessions that have not ended by then (the booking picker, T-SCH-02).
 */
export async function listSessions(
  tx: TenantTx,
  query: ScheduleSessionListQuery,
  timeZone: string,
  bookableAt?: Date,
): Promise<ScheduleSession[]> {
  const rows = await tx.scheduleSession.findMany({
    where: {
      sessionDate: { gte: new Date(query.from), lte: new Date(query.to) },
      ...(query.practitionerId ? { practitionerId: query.practitionerId } : {}),
      ...(bookableAt ? { status: 'PUBLISHED', endsAt: { gt: bookableAt } } : {}),
    },
    select: COLUMNS,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => toSession(row, timeZone));
}

export async function findSession(
  tx: TenantTx,
  sessionId: string,
  timeZone: string,
): Promise<ScheduleSession | null> {
  const row = await tx.scheduleSession.findUnique({ where: { id: sessionId }, select: COLUMNS });
  return row ? toSession(row, timeZone) : null;
}

export async function findStoredSession(
  tx: TenantTx,
  sessionId: string,
): Promise<StoredSession | null> {
  const row = await tx.scheduleSession.findUnique({
    where: { id: sessionId },
    select: { status: true, bookedCount: true, endsAt: true, version: true },
  });
  return row ? { ...row, status: row.status as SessionStatus } : null;
}

/**
 * Whether the practitioner has another session, not cancelled, that overlaps `times`. Back to back
 * (one ends when the next starts) is not an overlap.
 */
export async function overlapsAnotherSession(
  tx: TenantTx,
  practitionerId: string,
  times: SessionTimes,
): Promise<boolean> {
  const row = await tx.scheduleSession.findFirst({
    where: {
      practitionerId,
      status: { not: 'CANCELLED' },
      startsAt: { lt: times.endsAt },
      endsAt: { gt: times.startsAt },
    },
    select: { id: true },
  });
  return row !== null;
}

export async function insertSession(
  tx: TenantTx,
  target: { tenantId: string; facilityId: string; userId: string },
  values: SessionTimes & { practitionerId: string; capacity: number },
  timeZone: string,
): Promise<ScheduleSession> {
  const row = await tx.scheduleSession.create({
    data: {
      tenantId: target.tenantId,
      facilityId: target.facilityId,
      practitionerId: values.practitionerId,
      sessionDate: new Date(values.sessionDate),
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      capacity: values.capacity,
      createdBy: target.userId,
      updatedBy: target.userId,
    },
    select: COLUMNS,
  });
  return toSession(row, timeZone);
}

/**
 * C-035, FR-SCH-003: takes one place in a published session that has not ended, only while a
 * place is free. The UPDATE locks the row, so of two concurrent bookings for the last place the
 * second re-reads the raised count and changes nothing. Returns 1 when a place was taken.
 */
export async function takePlace(tx: TenantTx, sessionId: string, now: Date): Promise<number> {
  const result = await tx.scheduleSession.updateMany({
    where: {
      id: sessionId,
      status: 'PUBLISHED',
      endsAt: { gt: now },
      bookedCount: { lt: tx.scheduleSession.fields.capacity },
    },
    data: { bookedCount: { increment: 1 } },
  });
  return result.count;
}

/** Gives back the place of a cancelled or rescheduled booking (AT-SCH-004, AT-SCH-005). */
export async function releasePlace(tx: TenantTx, sessionId: string): Promise<void> {
  await tx.scheduleSession.updateMany({
    where: { id: sessionId, bookedCount: { gt: 0 } },
    data: { bookedCount: { decrement: 1 } },
  });
}

/**
 * Sets the status only if the row is still at `expectedVersion` (SP-03). Returns the number of
 * rows changed: 0 means another change won the race.
 */
export async function updateSessionStatus(
  tx: TenantTx,
  target: { sessionId: string; expectedVersion: number; userId: string; at: Date },
  status: SessionStatus,
): Promise<number> {
  const result = await tx.scheduleSession.updateMany({
    where: {
      id: target.sessionId,
      version: target.expectedVersion,
      // A booking takes a place without changing the version, so a cancel also checks the count
      // here: a booking that won the race keeps its session (T-SCH-02).
      ...(status === 'CANCELLED' ? { bookedCount: 0 } : {}),
    },
    data: {
      status,
      updatedBy: target.userId,
      updatedAt: target.at,
      version: { increment: 1 },
    },
  });
  return result.count;
}
