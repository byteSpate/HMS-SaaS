// Prisma access for audit search (T-PLT-02; FR-AUD-005; AT-AUD-005). Runs under the hospital's RLS,
// so another hospital's events and people are simply not found. Pages by the time-ordered UUIDv7
// ID: occurred_at has microseconds that a JavaScript Date would round, which could skip a row.
import type { AuditEventRow, AuditSearchQuery } from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import type { AdminRef } from './account-lock.repository.js';

export interface AuditPage {
  rows: AuditEventRow[];
  nextCursor: string | null;
}

const EMPTY_PAGE: AuditPage = { rows: [], nextCursor: null };

async function memberUserId(tx: TenantTx, username: string): Promise<string | null> {
  const membership = await tx.membership.findFirst({
    where: { user: { username } },
    select: { userId: true },
  });
  return membership?.userId ?? null;
}

async function namesOf(tx: TenantTx, userIds: readonly (string | null)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  const users = await tx.userAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true, displayName: true },
  });
  return new Map(users.map((user) => [user.id, user.displayName]));
}

function timeFilter(query: AuditSearchQuery) {
  if (!query.from && !query.to) return {};
  return {
    occurredAt: {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    },
  };
}

export function searchAuditEvents(
  prisma: PrismaClient,
  admin: AdminRef,
  query: AuditSearchQuery,
): Promise<AuditPage> {
  const scope = { tenantId: admin.tenantId, userId: admin.userId };
  return withTenant(prisma, scope, async (tx) => {
    const actorUserId = query.actor ? await memberUserId(tx, query.actor) : undefined;
    if (actorUserId === null) return EMPTY_PAGE;

    const events = await tx.auditEvent.findMany({
      where: {
        ...(actorUserId ? { actorUserId } : {}),
        ...(query.action ? { action: { startsWith: query.action } } : {}),
        ...(query.targetId ? { targetId: query.targetId } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
        ...timeFilter(query),
      },
      orderBy: { id: 'desc' },
      // One extra row says whether another page exists.
      take: query.limit + 1,
    });
    const page = events.slice(0, query.limit);
    const names = await namesOf(
      tx,
      page.map((event) => event.actorUserId),
    );
    return {
      rows: page.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt.toISOString(),
        action: event.action,
        outcome: event.outcome,
        actorUserId: event.actorUserId,
        actorName: event.actorUserId ? (names.get(event.actorUserId) ?? null) : null,
        targetType: event.targetType,
        targetId: event.targetId,
        reason: event.reason,
        correlationId: event.correlationId,
        details: event.details as Record<string, unknown> | null,
      })),
      nextCursor: events.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  });
}
