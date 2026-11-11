// Appointments (T-SCH-02; FR-SCH-001..005; UC-SCH-01/02; C-035; FR-AUD-001; SP-03). Reception books
// a patient into a published session, reschedules, cancels with a reason, or marks a no-show after
// the session. Each command is one transaction: the place in the session, the appointment, its
// audit event and an AppointmentChanged outbox event. A booking creates no visit or invoice
// (FR-SCH-001); those come with check-in (T-VIS-01).
import { Inject, Injectable } from '@nestjs/common';
import type {
  Appointment,
  AppointmentList,
  AppointmentListQuery,
  BookAppointmentRequest,
  CancelAppointmentRequest,
  MarkNoShowRequest,
  RescheduleAppointmentRequest,
  ScheduleSessionList,
  ScheduleSessionListQuery,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { isBookablePatient } from '@hms/mod-patients';
import { appendAuditEvent, appendOutboxEvent, PRISMA } from '@hms/platform';
import {
  appointmentNotFound,
  assertBookable,
  nextAppointmentStatus,
  staleAppointment,
  type AppointmentAction,
} from '../domain/appointment.js';
import { fieldError, type SessionStatus } from '../domain/schedule-session.js';
import {
  findAppointment,
  findSessionForBooking,
  findStoredAppointment,
  hasLiveBooking,
  insertAppointment,
  listAppointments,
  updateAppointmentStatus,
  type StoredAppointment,
} from '../infrastructure/appointment.repository.js';
import {
  listSessions,
  releasePlace,
  takePlace,
} from '../infrastructure/schedule-session.repository.js';
import { HOSPITAL_TIME_ZONE, requestScope, SCHEDULING_CLOCK, type Scope } from './context.js';

const notFound = appointmentNotFound;
const stale = staleAppointment;

/** The audit event and the outbox event every change writes, in the change's transaction. */
async function recordChange(
  tx: TenantTx,
  scope: Scope,
  change: { action: string; appointmentId: string; details: Record<string, string | number> },
): Promise<void> {
  await appendAuditEvent(tx, {
    tenantId: scope.tenantId,
    action: change.action,
    outcome: 'SUCCEEDED',
    actorUserId: scope.userId,
    ...(scope.membershipId ? { membershipId: scope.membershipId } : {}),
    targetType: 'appointment',
    targetId: change.appointmentId,
    correlationId: scope.correlationId,
    details: change.details,
  });
  await appendOutboxEvent(tx, {
    tenantId: scope.tenantId,
    eventType: 'AppointmentChanged',
    aggregateType: 'appointment',
    aggregateId: change.appointmentId,
    payload: { appointmentId: change.appointmentId, ...change.details },
  });
}

/**
 * Takes a place for the patient in the session, or says why not: a double booking, a session
 * that is not open (UC-SCH-01 D2), or a full one (D1, CAPACITY_FULL). The place is taken by one
 * conditional UPDATE, so concurrent bookings never pass capacity (C-035, AT-SCH-003).
 *
 * The place is taken before the double-booking check on purpose: the UPDATE locks the session
 * row until commit, so a concurrent booking of the same patient waits, and its check (a new
 * READ COMMITTED snapshot) then sees the first booking and answers a field error instead of
 * hitting the partial unique index as a 500. Throwing rolls the place back.
 */
async function takePlaceFor(
  tx: TenantTx,
  booking: { patientId: string; sessionId: string },
  now: Date,
): Promise<void> {
  const placeTaken = (await takePlace(tx, booking.sessionId, now)) === 1;
  if (await hasLiveBooking(tx, booking.patientId, booking.sessionId)) {
    throw fieldError('patientId', 'This patient is already booked in this session');
  }
  if (placeTaken) return;
  // RLS hides another hospital's session, so it reads as missing.
  const session = await findSessionForBooking(tx, booking.sessionId);
  if (!session) throw fieldError('sessionId', 'Choose a session of this hospital');
  assertBookable({ status: session.status as SessionStatus, endsAt: session.endsAt }, now);
  throw new DomainError('CAPACITY_FULL', 'This session is full', { sessionId: booking.sessionId });
}

@Injectable()
export class AppointmentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(SCHEDULING_CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: AppointmentListQuery): Promise<AppointmentList> {
    const scope = requestScope();
    const appointments = await withTenant(this.prisma, scope, (tx) =>
      listAppointments(tx, query, HOSPITAL_TIME_ZONE),
    );
    return { appointments };
  }

  /** The sessions a booking can go into: published and not ended (UC-SCH-01). */
  async bookableSessions(query: ScheduleSessionListQuery): Promise<ScheduleSessionList> {
    const scope = requestScope();
    const now = this.clock.now();
    const sessions = await withTenant(this.prisma, scope, (tx) =>
      listSessions(tx, query, HOSPITAL_TIME_ZONE, now),
    );
    return { sessions };
  }

  book(request: BookAppointmentRequest): Promise<Appointment> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      if (!(await isBookablePatient(tx, request.patientId))) {
        throw fieldError('patientId', 'Choose a patient of this hospital');
      }
      await takePlaceFor(tx, request, now);
      const created = await insertAppointment(
        tx,
        { ...request, tenantId: scope.tenantId, userId: scope.userId, at: now },
        HOSPITAL_TIME_ZONE,
      );
      await recordChange(tx, scope, {
        action: 'scheduling.appointment.booked',
        appointmentId: created.appointmentId,
        details: { sessionId: request.sessionId, status: 'BOOKED', version: 1 },
      });
      return created;
    });
  }

  /** UC-SCH-02: the new booking, the old one RESCHEDULED and its place freed, in one step. */
  reschedule(appointmentId: string, request: RescheduleAppointmentRequest): Promise<Appointment> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await this.storedFor(tx, appointmentId, request.expectedVersion);
      nextAppointmentStatus(stored.status, 'RESCHEDULE', stored.sessionEndsAt, now);
      if (request.sessionId === stored.sessionId) {
        throw fieldError('sessionId', 'Choose another session');
      }
      await takePlaceFor(tx, { patientId: stored.patientId, sessionId: request.sessionId }, now);
      const target = { appointmentId, expectedVersion: request.expectedVersion, at: now };
      await this.setStatus(tx, scope, target, { status: 'RESCHEDULED' });
      await releasePlace(tx, stored.sessionId);
      const moved = await insertAppointment(
        tx,
        {
          tenantId: scope.tenantId,
          patientId: stored.patientId,
          sessionId: request.sessionId,
          userId: scope.userId,
          at: now,
          rescheduledFromId: appointmentId,
        },
        HOSPITAL_TIME_ZONE,
      );
      await recordChange(tx, scope, {
        action: 'scheduling.appointment.rescheduled',
        appointmentId,
        details: { toAppointmentId: moved.appointmentId, toSessionId: request.sessionId },
      });
      await recordChange(tx, scope, {
        action: 'scheduling.appointment.booked',
        appointmentId: moved.appointmentId,
        details: { sessionId: request.sessionId, rescheduledFromId: appointmentId, version: 1 },
      });
      return moved;
    });
  }

  /** FR-SCH-002: the record stays, with the reason; the place is freed (AT-SCH-005). */
  cancel(appointmentId: string, request: CancelAppointmentRequest): Promise<Appointment> {
    return this.change(appointmentId, request.expectedVersion, 'CANCEL', request.reason);
  }

  /** FR-SCH-005: after the session; no visit or invoice, and the place stays counted. */
  markNoShow(appointmentId: string, request: MarkNoShowRequest): Promise<Appointment> {
    return this.change(appointmentId, request.expectedVersion, 'NO_SHOW');
  }

  private change(
    appointmentId: string,
    expectedVersion: number,
    action: Exclude<AppointmentAction, 'RESCHEDULE'>,
    reason?: string,
  ): Promise<Appointment> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await this.storedFor(tx, appointmentId, expectedVersion);
      const status = nextAppointmentStatus(stored.status, action, stored.sessionEndsAt, now);
      const target = { appointmentId, expectedVersion, at: now };
      await this.setStatus(tx, scope, target, {
        status,
        ...(reason ? { cancelReason: reason } : {}),
      });
      if (status === 'CANCELLED') await releasePlace(tx, stored.sessionId);
      await recordChange(tx, scope, {
        action:
          status === 'CANCELLED'
            ? 'scheduling.appointment.cancelled'
            : 'scheduling.appointment.no_show',
        appointmentId,
        details: { fromVersion: expectedVersion, toVersion: expectedVersion + 1, status },
      });
      const saved = await findAppointment(tx, appointmentId, HOSPITAL_TIME_ZONE);
      if (!saved) throw notFound();
      return saved;
    });
  }

  private async storedFor(
    tx: TenantTx,
    appointmentId: string,
    expectedVersion: number,
  ): Promise<StoredAppointment> {
    const stored = await findStoredAppointment(tx, appointmentId);
    if (!stored) throw notFound();
    if (stored.version !== expectedVersion) throw stale(stored.version);
    return stored;
  }

  /** A concurrent change may have won since the read; the version check decides. */
  private async setStatus(
    tx: TenantTx,
    scope: Scope,
    target: { appointmentId: string; expectedVersion: number; at: Date },
    change: Parameters<typeof updateAppointmentStatus>[2],
  ): Promise<void> {
    const changed = await updateAppointmentStatus(tx, { ...target, userId: scope.userId }, change);
    if (changed === 0) throw stale(target.expectedVersion + 1);
  }
}
