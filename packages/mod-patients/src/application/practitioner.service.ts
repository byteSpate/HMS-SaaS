// Practitioner master (T-PRA-01; FR-PRA-001..003; FR-AUD-001; SP-03). Create, edit and list a
// hospital's practitioners. Each change is one transaction with its audit event and an outbox
// event; the outbox event is what a future picker cache listens to (FR-PRA-002). Lists read the
// table directly today, so a saved practitioner shows in every list on the next request.
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatePractitionerRequest,
  Practitioner,
  PractitionerList,
  UpdatePractitionerRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { appendAuditEvent, appendOutboxEvent, PRISMA } from '@hms/platform';
import { fieldError } from '../domain/patient-identity.js';
import { changedPractitionerFields, practitionerValuesOf } from '../domain/practitioner.js';
import {
  findPractitioner,
  insertPractitioner,
  listPractitioners,
  updatePractitioner,
} from '../infrastructure/practitioner.repository.js';
import { PATIENTS_CLOCK, requestScope, type Scope } from './context.js';

const notFound = () => new DomainError('NOT_FOUND', 'Practitioner not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'Someone else changed this practitioner; reload it', {
    currentVersion,
  });

/** One audit event per change; field names only, the values stay in the row. */
function auditChange(
  tx: TenantTx,
  scope: Scope,
  change: { action: string; practitionerId: string; details: Record<string, string | number> },
): Promise<void> {
  return appendAuditEvent(tx, {
    tenantId: scope.tenantId,
    action: change.action,
    outcome: 'SUCCEEDED',
    actorUserId: scope.userId,
    ...(scope.membershipId ? { membershipId: scope.membershipId } : {}),
    targetType: 'practitioner',
    targetId: change.practitionerId,
    correlationId: scope.correlationId,
    details: change.details,
  });
}

@Injectable()
export class PractitionerService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(PATIENTS_CLOCK) private readonly clock: Clock,
  ) {}

  async list(): Promise<PractitionerList> {
    const scope = requestScope();
    return { practitioners: await withTenant(this.prisma, scope, listPractitioners) };
  }

  async detail(practitionerId: string): Promise<Practitioner> {
    const scope = requestScope();
    const found = await withTenant(this.prisma, scope, (tx) =>
      findPractitioner(tx, practitionerId),
    );
    if (!found) throw notFound();
    return found;
  }

  /** FR-PRA-001: no duplicate check, two practitioners may share a name. */
  create(request: CreatePractitionerRequest): Promise<Practitioner> {
    const scope = requestScope();
    const values = practitionerValuesOf(request);
    return withTenant(this.prisma, scope, async (tx) => {
      const created = await insertPractitioner(tx, scope, values);
      await auditChange(tx, scope, {
        action: 'practitioner.created',
        practitionerId: created.practitionerId,
        details: { version: created.version },
      });
      await appendOutboxEvent(tx, {
        tenantId: scope.tenantId,
        eventType: 'PractitionerChanged',
        aggregateType: 'practitioner',
        aggregateId: created.practitionerId,
        payload: { practitionerId: created.practitionerId, version: created.version },
      });
      return created;
    });
  }

  update(practitionerId: string, request: UpdatePractitionerRequest): Promise<Practitioner> {
    const scope = requestScope();
    const next = { ...practitionerValuesOf(request), active: request.active };
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await findPractitioner(tx, practitionerId);
      if (!stored) throw notFound();
      if (stored.version !== request.expectedVersion) throw stale(stored.version);

      const changed = changedPractitionerFields(stored, next);
      if (changed.length === 0) {
        throw fieldError('nameEn', 'Nothing differs from the current values');
      }
      const target = {
        practitionerId,
        expectedVersion: request.expectedVersion,
        userId: scope.userId,
        at: this.clock.now(),
      };
      // A concurrent edit may have won since the read; the version check decides.
      if ((await updatePractitioner(tx, target, next)) === 0) {
        throw stale(request.expectedVersion + 1);
      }
      const version = request.expectedVersion + 1;
      await auditChange(tx, scope, {
        action: 'practitioner.changed',
        practitionerId,
        details: { changedFields: changed.join(','), fromVersion: version - 1, toVersion: version },
      });
      await appendOutboxEvent(tx, {
        tenantId: scope.tenantId,
        eventType: 'PractitionerChanged',
        aggregateType: 'practitioner',
        aggregateId: practitionerId,
        payload: { practitionerId, version },
      });
      return { practitionerId, ...next, version };
    });
  }
}
