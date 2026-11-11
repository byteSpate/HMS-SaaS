// What every tenant command needs from the request, and the audit and outbox pair it writes
// (FR-AUD-001; ADR-006; D section 8.6). Shared by the modules so the scope check and the audit
// envelope are written once. T-BIL-01 moved them here; older modules still keep local copies.
import type { Prisma, TenantTx } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { appendAuditEvent } from './audit.js';
import { appendOutboxEvent } from './outbox.js';
import { getRequestContext } from './request-context.js';

export interface Scope {
  tenantId: string;
  userId: string;
  membershipId?: string;
  correlationId: string;
}

/** The hospital and user of the request; a request without a hospital is refused. */
export function requestScope(): Scope {
  const context = getRequestContext();
  if (!context?.tenantId || !context.userId) {
    throw new DomainError('TENANT_NOT_SELECTED', 'Choose a hospital first');
  }
  return { ...context, tenantId: context.tenantId, userId: context.userId };
}

export interface RecordedChange {
  /** The audit action, for example billing.price_list.published. */
  action: string;
  /** The outbox event type, for example PriceListPublished. */
  eventType: string;
  targetType: string;
  targetId: string;
  /** IDs, codes and counts only: audit details and outbox payloads are not for patient data. */
  details: Record<string, string | number | boolean | null>;
}

/** price_list_version -> priceListVersionId, the payload key consumers read the target from. */
const idKeyOf = (targetType: string) =>
  `${targetType.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase())}Id`;

/** The audit event and the outbox event of one change, in the change's own transaction. */
export async function recordChange(
  tx: TenantTx,
  scope: Scope,
  change: RecordedChange,
): Promise<void> {
  await appendAuditEvent(tx, {
    tenantId: scope.tenantId,
    action: change.action,
    outcome: 'SUCCEEDED',
    actorUserId: scope.userId,
    ...(scope.membershipId ? { membershipId: scope.membershipId } : {}),
    targetType: change.targetType,
    targetId: change.targetId,
    correlationId: scope.correlationId,
    details: change.details,
  });
  await appendOutboxEvent(tx, {
    tenantId: scope.tenantId,
    eventType: change.eventType,
    aggregateType: change.targetType,
    aggregateId: change.targetId,
    payload: {
      [idKeyOf(change.targetType)]: change.targetId,
      ...change.details,
    } as Prisma.InputJsonObject,
  });
}
