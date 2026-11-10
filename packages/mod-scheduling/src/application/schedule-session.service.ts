// Schedule sessions (T-SCH-01; FR-SCH-002; AT-SCH-001; C-035; FR-AUD-001; SP-03). Staff list a date
// range, enter a session for an active practitioner as a draft, publish it, or cancel it while
// nothing is booked. Each change is one transaction with its audit event and an outbox event, which
// booking screens and a future doctor app can listen to.
import { Inject, Injectable } from '@nestjs/common';
import type {
  ChangeScheduleSessionRequest,
  CreateScheduleSessionRequest,
  PractitionerChoiceList,
  ScheduleSession,
  ScheduleSessionList,
  ScheduleSessionListQuery,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { hospitalFacilityId } from '@hms/mod-identity-access';
import { isSchedulablePractitioner, listPractitionerChoices } from '@hms/mod-patients';
import { appendAuditEvent, appendOutboxEvent, PRISMA } from '@hms/platform';
import {
  assertNotEnded,
  fieldError,
  nextSessionStatus,
  sessionTimesOf,
  type SessionAction,
} from '../domain/schedule-session.js';
import {
  findSession,
  findStoredSession,
  insertSession,
  listSessions,
  overlapsAnotherSession,
  updateSessionStatus,
} from '../infrastructure/schedule-session.repository.js';
import { HOSPITAL_TIME_ZONE, requestScope, SCHEDULING_CLOCK, type Scope } from './context.js';

const notFound = () => new DomainError('NOT_FOUND', 'Session not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this session; reload it', {
    currentVersion,
  });

const AUDIT_ACTIONS: Record<SessionAction, string> = {
  PUBLISH: 'scheduling.session.published',
  CANCEL: 'scheduling.session.cancelled',
};

/** The audit event and the outbox event every change writes, in the change's transaction. */
async function recordChange(
  tx: TenantTx,
  scope: Scope,
  change: { action: string; sessionId: string; details: Record<string, string | number> },
): Promise<void> {
  await appendAuditEvent(tx, {
    tenantId: scope.tenantId,
    action: change.action,
    outcome: 'SUCCEEDED',
    actorUserId: scope.userId,
    ...(scope.membershipId ? { membershipId: scope.membershipId } : {}),
    targetType: 'schedule_session',
    targetId: change.sessionId,
    correlationId: scope.correlationId,
    details: change.details,
  });
  await appendOutboxEvent(tx, {
    tenantId: scope.tenantId,
    eventType: 'ScheduleSessionChanged',
    aggregateType: 'schedule_session',
    aggregateId: change.sessionId,
    payload: { sessionId: change.sessionId, ...change.details },
  });
}

@Injectable()
export class ScheduleSessionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(SCHEDULING_CLOCK) private readonly clock: Clock,
  ) {}

  async list(query: ScheduleSessionListQuery): Promise<ScheduleSessionList> {
    const scope = requestScope();
    const sessions = await withTenant(this.prisma, scope, (tx) =>
      listSessions(tx, query, HOSPITAL_TIME_ZONE),
    );
    return { sessions };
  }

  /** The active practitioners for the session form's picker. */
  async practitionerChoices(): Promise<PractitionerChoiceList> {
    const scope = requestScope();
    return { practitioners: await withTenant(this.prisma, scope, listPractitionerChoices) };
  }

  create(request: CreateScheduleSessionRequest): Promise<ScheduleSession> {
    const scope = requestScope();
    const times = sessionTimesOf(request, this.clock.now(), HOSPITAL_TIME_ZONE);
    return withTenant(this.prisma, scope, async (tx) => {
      // RLS hides another hospital's practitioners, so they read as not schedulable.
      if (!(await isSchedulablePractitioner(tx, request.practitionerId))) {
        throw fieldError('practitionerId', 'Choose an active practitioner of this hospital');
      }
      // A doctor cannot sit two sessions at once; a second entry of the same sitting is a mistake.
      if (await overlapsAnotherSession(tx, request.practitionerId, times)) {
        throw fieldError('startTime', 'This practitioner already has a session at this time');
      }
      const facilityId = await hospitalFacilityId(tx, scope.tenantId);
      const created = await insertSession(
        tx,
        { tenantId: scope.tenantId, facilityId, userId: scope.userId },
        { ...times, practitionerId: request.practitionerId, capacity: request.capacity },
        HOSPITAL_TIME_ZONE,
      );
      await recordChange(tx, scope, {
        action: 'scheduling.session.created',
        sessionId: created.sessionId,
        details: { version: created.version, status: created.status },
      });
      return created;
    });
  }

  publish(sessionId: string, request: ChangeScheduleSessionRequest): Promise<ScheduleSession> {
    return this.change(sessionId, request, 'PUBLISH');
  }

  cancel(sessionId: string, request: ChangeScheduleSessionRequest): Promise<ScheduleSession> {
    return this.change(sessionId, request, 'CANCEL');
  }

  private change(
    sessionId: string,
    request: ChangeScheduleSessionRequest,
    action: SessionAction,
  ): Promise<ScheduleSession> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await findStoredSession(tx, sessionId);
      if (!stored) throw notFound();
      if (stored.version !== request.expectedVersion) throw stale(stored.version);
      const status = nextSessionStatus(stored.status, action, stored.bookedCount);
      // AT-SCH-001: a session that has ended cannot be opened for booking.
      if (action === 'PUBLISH') assertNotEnded(stored.endsAt, now);

      const target = { sessionId, expectedVersion: request.expectedVersion, userId: scope.userId };
      // A concurrent change may have won since the read; the version check decides.
      if ((await updateSessionStatus(tx, { ...target, at: now }, status)) === 0) {
        throw stale(request.expectedVersion + 1);
      }
      const version = request.expectedVersion + 1;
      await recordChange(tx, scope, {
        action: AUDIT_ACTIONS[action],
        sessionId,
        details: { fromVersion: version - 1, toVersion: version, status },
      });
      const saved = await findSession(tx, sessionId, HOSPITAL_TIME_ZONE);
      if (!saved) throw notFound();
      return saved;
    });
  }
}
