// Cashier sessions (T-BIL-03; FR-BIL-026; UC-BIL-04; SRC-B07; FR-AUD-001). A cashier
// (billing.cashier_session.manage) opens one session at the hospital's facility, with an optional
// cash float, and closes it with the amount counted for each method; the server computes what was
// expected and the variance. A finance user (billing.cashier_session.review) other than the
// cashier reviews closed sessions, with a note when there is a variance. Each command is one
// transaction with its audit event and outbox event.
import { Inject, Injectable } from '@nestjs/common';
import type {
  CashierSession,
  CashierSessionList,
  CashierSessionListQuery,
  CloseCashierSessionRequest,
  CurrentCashierSession,
  OpenCashierSessionRequest,
  ReviewCashierSessionRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError, Money, type Clock } from '@hms/domain-kernel';
import { findStaffNames, hospitalFacilityId } from '@hms/mod-identity-access';
import { PRISMA, recordChange, requestScope } from '@hms/platform';
import {
  assertClosable,
  assertReviewable,
  hasVariance,
  sessionTotals,
  zeroAmounts,
  type MethodAmounts,
  type SessionTotal,
} from '../domain/cashier-session.js';
import {
  closeSession,
  findOpenSession,
  findSession,
  listSessionsByStatus,
  lockSession,
  openSession,
  reviewSession,
  type StoredSession,
} from '../infrastructure/cashier-session.repository.js';
import { BILLING_CLOCK } from './context.js';

const notFound = () => new DomainError('NOT_FOUND', 'Cashier session not found');
const stale = (currentVersion: number) =>
  new DomainError('STALE_RECORD', 'This cashier session changed; reload it', { currentVersion });

/** Payments come with T-BIL-04; until then a session holds only its float. */
function paymentTotalsOf(): Promise<MethodAmounts> {
  return Promise.resolve(zeroAmounts());
}

/** The open session's live expected amounts, or the rows stored when it was closed. */
async function totalsOf(stored: StoredSession): Promise<SessionTotal[]> {
  return stored.closing ?? sessionTotals(stored.openingFloat, await paymentTotalsOf(), null);
}

async function toSessions(tx: TenantTx, stored: StoredSession[]): Promise<CashierSession[]> {
  const names = await findStaffNames(
    tx,
    stored.flatMap((session) => [session.cashierId, session.reviewedBy]),
  );
  const staffRef = (userId: string) => ({ userId, displayName: names.get(userId) ?? '' });
  return Promise.all(
    stored.map(async (session) => {
      const totals = await totalsOf(session);
      return {
        sessionId: session.sessionId,
        cashier: staffRef(session.cashierId),
        status: session.status as CashierSession['status'],
        openingFloat: session.openingFloat.toDecimalString(),
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() ?? null,
        totals: totals.map((row) => ({
          method: row.method,
          expected: row.expected.toDecimalString(),
          counted: row.counted?.toDecimalString() ?? null,
          variance: row.variance?.toDecimalString() ?? null,
        })),
        hasVariance: hasVariance(totals),
        review:
          session.reviewedBy && session.reviewedAt
            ? {
                reviewedBy: staffRef(session.reviewedBy),
                reviewedAt: session.reviewedAt.toISOString(),
                note: session.reviewNote,
              }
            : null,
        version: session.version,
      };
    }),
  );
}

async function toSession(tx: TenantTx, stored: StoredSession): Promise<CashierSession> {
  const [session] = await toSessions(tx, [stored]);
  if (!session) throw notFound();
  return session;
}

async function reread(tx: TenantTx, sessionId: string): Promise<CashierSession> {
  const stored = await findSession(tx, sessionId);
  if (!stored) throw notFound();
  return toSession(tx, stored);
}

const countedOf = (counted: CloseCashierSessionRequest['counted']): MethodAmounts => ({
  CASH: Money.parse(counted.CASH),
  CARD: Money.parse(counted.CARD),
  MOBILE: Money.parse(counted.MOBILE),
  BANK_TRANSFER: Money.parse(counted.BANK_TRANSFER),
});

@Injectable()
export class CashierSessionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(BILLING_CLOCK) private readonly clock: Clock,
  ) {}

  current(): Promise<CurrentCashierSession> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => {
      const facilityId = await hospitalFacilityId(tx, scope.tenantId);
      const stored = await findOpenSession(tx, facilityId, scope.userId);
      return { session: stored ? await toSession(tx, stored) : null };
    });
  }

  open(request: OpenCashierSessionRequest): Promise<CashierSession> {
    const scope = requestScope();
    const now = this.clock.now();
    const openingFloat = Money.parse(request.openingFloat ?? '0.00');
    return withTenant(this.prisma, scope, async (tx) => {
      const sessionId = await openSession(tx, {
        tenantId: scope.tenantId,
        facilityId: await hospitalFacilityId(tx, scope.tenantId),
        cashierId: scope.userId,
        openingFloat,
        at: now,
      });
      // UC-BIL-04 D1: one open session per cashier.
      if (!sessionId) {
        throw new DomainError('INVALID_TRANSITION', 'You already have an open cashier session');
      }
      await recordChange(tx, scope, {
        action: 'billing.cashier_session.opened',
        eventType: 'CashierSessionOpened',
        targetType: 'cashier_session',
        targetId: sessionId,
        details: { openingFloat: openingFloat.toDecimalString() },
      });
      return reread(tx, sessionId);
    });
  }

  close(sessionId: string, request: CloseCashierSessionRequest): Promise<CashierSession> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await findSession(tx, sessionId);
      if (!stored) throw notFound();
      assertClosable(stored, scope.userId);
      if (stored.version !== request.expectedVersion) throw stale(stored.version);
      // Lock before summing, so a payment still being recorded in this session is counted.
      await lockSession(tx, sessionId);
      const totals = sessionTotals(
        stored.openingFloat,
        await paymentTotalsOf(),
        countedOf(request.counted),
      );
      const rows = totals.map((row) => ({
        method: row.method,
        expected: row.expected,
        counted: row.counted ?? Money.zero(),
        variance: row.variance ?? Money.zero(),
      }));
      const closed = await closeSession(tx, {
        tenantId: scope.tenantId,
        sessionId,
        expectedVersion: request.expectedVersion,
        at: now,
        rows,
      });
      if (!closed) throw stale(request.expectedVersion + 1);
      await recordChange(tx, scope, {
        action: 'billing.cashier_session.closed',
        eventType: 'CashierSessionClosed',
        targetType: 'cashier_session',
        targetId: sessionId,
        details: Object.fromEntries([
          ['hasVariance', hasVariance(totals)],
          ...rows.map((row) => [`variance${row.method}`, row.variance.toDecimalString()]),
        ]) as Record<string, string | boolean>,
      });
      return reread(tx, sessionId);
    });
  }

  list(query: CashierSessionListQuery): Promise<CashierSessionList> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => ({
      sessions: await toSessions(tx, await listSessionsByStatus(tx, query.status)),
    }));
  }

  review(sessionId: string, request: ReviewCashierSessionRequest): Promise<CashierSession> {
    const scope = requestScope();
    const now = this.clock.now();
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await findSession(tx, sessionId);
      if (!stored) throw notFound();
      if (stored.version !== request.expectedVersion) throw stale(stored.version);
      const variance = hasVariance(stored.closing ?? []);
      assertReviewable({ ...stored, hasVariance: variance }, scope.userId, request.note);
      const note = request.note?.trim() || null;
      const reviewed = await reviewSession(tx, {
        sessionId,
        expectedVersion: request.expectedVersion,
        reviewerId: scope.userId,
        note,
        at: now,
      });
      if (!reviewed) throw stale(request.expectedVersion + 1);
      await recordChange(tx, scope, {
        action: 'billing.cashier_session.reviewed',
        eventType: 'CashierSessionReviewed',
        targetType: 'cashier_session',
        targetId: sessionId,
        details: { hasVariance: variance, withNote: note !== null },
      });
      return reread(tx, sessionId);
    });
  }
}
