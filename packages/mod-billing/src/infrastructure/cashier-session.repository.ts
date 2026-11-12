// Cashier session rows in PostgreSQL (T-BIL-03; FR-BIL-026; UC-BIL-04; E section 5.4). Every
// function runs in the caller's withTenant() transaction, so RLS limits it to one hospital
// (ADR-003). Amounts cross the boundary here only: numeric in the database, Money in the code.
import type { TenantTx } from '@hms/database';
import { Money } from '@hms/domain-kernel';
import {
  SESSION_METHODS,
  type SessionMethod,
  type SessionTotal,
} from '../domain/cashier-session.js';

const moneyOf = (value: { toFixed(digits: number): string }) => Money.parse(value.toFixed(2));

export interface StoredSession {
  sessionId: string;
  cashierId: string;
  status: string;
  openingFloat: Money;
  openedAt: Date;
  closedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  version: number;
  /** The rows stored at closing (expected, counted, variance); null while the session is open. */
  closing: SessionTotal[] | null;
}

const SESSION_COLUMNS = {
  id: true,
  cashierId: true,
  status: true,
  openingFloat: true,
  openedAt: true,
  closedAt: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNote: true,
  version: true,
  counts: { select: { method: true, expected: true, counted: true, variance: true } },
} as const;

type SessionRow = NonNullable<Awaited<ReturnType<typeof readSessionRow>>>;

function readSessionRow(tx: TenantTx, sessionId: string) {
  return tx.cashierSession.findUnique({ where: { id: sessionId }, select: SESSION_COLUMNS });
}

/** The closing rows in method order; closing writes one row for every method. */
function closingOf(rows: SessionRow['counts']): SessionTotal[] | null {
  if (rows.length === 0) return null;
  const byMethod = new Map(rows.map((row) => [row.method, row]));
  return SESSION_METHODS.map((method) => {
    const row = byMethod.get(method);
    if (!row) throw new Error(`The closing of a cashier session has no ${method} row`);
    return {
      method,
      expected: moneyOf(row.expected),
      counted: moneyOf(row.counted),
      variance: moneyOf(row.variance),
    };
  });
}

function toStored(row: SessionRow): StoredSession {
  return {
    sessionId: row.id,
    cashierId: row.cashierId,
    status: row.status,
    openingFloat: moneyOf(row.openingFloat),
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    version: row.version,
    closing: closingOf(row.counts),
  };
}

export async function findSession(tx: TenantTx, sessionId: string): Promise<StoredSession | null> {
  const row = await readSessionRow(tx, sessionId);
  return row ? toStored(row) : null;
}

/** The cashier's open session at the facility, if any (one at most, UC-BIL-04 D1). */
export async function findOpenSession(
  tx: TenantTx,
  facilityId: string,
  cashierId: string,
): Promise<StoredSession | null> {
  const row = await tx.cashierSession.findFirst({
    where: { facilityId, cashierId, status: 'OPEN' },
    select: SESSION_COLUMNS,
  });
  return row ? toStored(row) : null;
}

/**
 * Opens a session unless the cashier has one open. A transaction-scoped advisory lock per cashier
 * serializes two "open" clicks, so the second sees the first session and gets null instead of
 * hitting the one-open index with a 500.
 */
export async function openSession(
  tx: TenantTx,
  values: {
    tenantId: string;
    facilityId: string;
    cashierId: string;
    openingFloat: Money;
    at: Date;
  },
): Promise<string | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${values.tenantId} || ':cashier_session:' || ${values.cashierId}))`;
  if (await findOpenSession(tx, values.facilityId, values.cashierId)) return null;
  const row = await tx.cashierSession.create({
    data: {
      tenantId: values.tenantId,
      facilityId: values.facilityId,
      cashierId: values.cashierId,
      openingFloat: values.openingFloat.toDecimalString(),
      openedAt: values.at,
      updatedAt: values.at,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Locks the session row until the transaction ends. Closing takes this lock before it sums the
 * payments, so a payment being recorded in the session (which holds a share lock on the same
 * row, T-BIL-04) finishes first and is counted, and no payment can join after the sums.
 */
export async function lockSession(tx: TenantTx, sessionId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM hms.cashier_session WHERE id = ${sessionId}::uuid FOR UPDATE`;
}

/** Sets the session CLOSED_PENDING_REVIEW with its counts. False when the version moved on. */
export async function closeSession(
  tx: TenantTx,
  values: {
    tenantId: string;
    sessionId: string;
    expectedVersion: number;
    at: Date;
    rows: { method: SessionMethod; expected: Money; counted: Money; variance: Money }[];
  },
): Promise<boolean> {
  const changed = await tx.cashierSession.updateMany({
    where: { id: values.sessionId, version: values.expectedVersion, status: 'OPEN' },
    data: {
      status: 'CLOSED_PENDING_REVIEW',
      closedAt: values.at,
      updatedAt: values.at,
      version: { increment: 1 },
    },
  });
  if (changed.count === 0) return false;
  await tx.cashierSessionCount.createMany({
    data: values.rows.map((row) => ({
      tenantId: values.tenantId,
      sessionId: values.sessionId,
      method: row.method,
      expected: row.expected.toDecimalString(),
      counted: row.counted.toDecimalString(),
      variance: row.variance.toDecimalString(),
    })),
  });
  return true;
}

/** Sets the session REVIEWED. False when the version moved on. */
export async function reviewSession(
  tx: TenantTx,
  values: {
    sessionId: string;
    expectedVersion: number;
    reviewerId: string;
    note: string | null;
    at: Date;
  },
): Promise<boolean> {
  const changed = await tx.cashierSession.updateMany({
    where: {
      id: values.sessionId,
      version: values.expectedVersion,
      status: 'CLOSED_PENDING_REVIEW',
    },
    data: {
      status: 'REVIEWED',
      reviewedBy: values.reviewerId,
      reviewedAt: values.at,
      reviewNote: values.note,
      updatedAt: values.at,
      version: { increment: 1 },
    },
  });
  return changed.count > 0;
}

/** Closed sessions for finance: waiting for review (oldest first), or reviewed (newest first). */
export async function listSessionsByStatus(
  tx: TenantTx,
  status: 'CLOSED_PENDING_REVIEW' | 'REVIEWED',
): Promise<StoredSession[]> {
  const rows = await tx.cashierSession.findMany({
    where: { status },
    select: SESSION_COLUMNS,
    orderBy: { closedAt: status === 'REVIEWED' ? 'desc' : 'asc' },
    take: 100,
  });
  return rows.map(toStored);
}
