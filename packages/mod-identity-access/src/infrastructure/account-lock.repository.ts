// Prisma access for account lock administration and diagnostics (T-ACC-03; UC-ACC-02;
// FR-ACC-004, FR-SUP-003). An administrator may only see or change accounts that have a
// membership in their own hospital; the membership lookup runs under RLS (withTenant).
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { appendAuditEvent } from '@hms/platform';
import type { AccountStatus } from '../domain/account-policy.js';
import type { LockReason, LockState } from '../domain/lockout-policy.js';

export interface AdminRef {
  tenantId: string;
  userId: string;
  membershipId: string;
}

export interface LockedAccountRow {
  id: string;
  username: string;
  status: AccountStatus;
  failedAttempts: number;
  lockedAt: Date | null;
  lockedUntil: Date | null;
  lockReason: LockReason | null;
  lockNote: string | null;
  lockedByUserId: string | null;
}

export interface LoginAttemptRow {
  occurredAt: Date;
  action: string;
  outcome: 'SUCCEEDED' | 'DENIED' | 'FAILED';
  reason: string | null;
  ipAddress: string | null;
  correlationId: string | null;
}

export interface LockChange {
  admin: AdminRef;
  targetUserId: string;
  state: LockState;
  /** The change applies only from these states (ADMIN_LOCK_FROM or UNLOCK_FROM). */
  allowedFrom: readonly AccountStatus[];
  action: 'admin.user.locked' | 'admin.user.unlocked';
  note: string;
  correlationId?: string;
}

const ACCOUNT_SELECT = {
  id: true,
  username: true,
  status: true,
  failedAttempts: true,
  lockedAt: true,
  lockedUntil: true,
  lockReason: true,
  lockNote: true,
  lockedByUserId: true,
} as const;

/** Login events kept in the diagnostics view; enough to see a burst of failures. */
const RECENT_ATTEMPTS = 20;

async function isMemberOfHospital(tx: TenantTx, userId: string): Promise<boolean> {
  // RLS limits membership rows to the administrator's hospital, so no tenant filter is needed.
  const row = await tx.membership.findFirst({ where: { userId }, select: { id: true } });
  return row !== null;
}

/** The account if it belongs to the administrator's hospital, otherwise null. */
export async function findAccountInHospital(
  prisma: PrismaClient,
  admin: AdminRef,
  targetUserId: string,
): Promise<LockedAccountRow | null> {
  return withTenant(prisma, { tenantId: admin.tenantId, userId: admin.userId }, async (tx) => {
    if (!(await isMemberOfHospital(tx, targetUserId))) return null;
    const account = await tx.userAccount.findUnique({
      where: { id: targetUserId },
      select: ACCOUNT_SELECT,
    });
    if (!account) return null;
    // The database CHECK user_account_lock_reason_check allows only the LockReason codes.
    return { ...account, lockReason: account.lockReason as LockReason | null };
  });
}

export type LockChangeResult = 'CHANGED' | 'NOT_FOUND' | 'INVALID_TRANSITION';

/**
 * Writes the new lock state and its audit event in one transaction (FR-AUD-001), so a lock
 * change is never left without its record. The status condition sits in the UPDATE itself, so
 * a concurrent change (for example the account being disabled) cannot be overwritten. Locking
 * revokes the user's sessions through the database trigger `user_account_access_removed`.
 */
export async function changeLock(
  prisma: PrismaClient,
  change: LockChange,
): Promise<LockChangeResult> {
  const { admin, targetUserId } = change;
  return withTenant(prisma, { tenantId: admin.tenantId, userId: admin.userId }, async (tx) => {
    if (!(await isMemberOfHospital(tx, targetUserId))) return 'NOT_FOUND';
    const updated = await tx.userAccount.updateMany({
      where: { id: targetUserId, status: { in: [...change.allowedFrom] } },
      data: { ...change.state, version: { increment: 1 } },
    });
    if (updated.count !== 1) return 'INVALID_TRANSITION';
    await appendAuditEvent(tx, {
      tenantId: admin.tenantId,
      action: change.action,
      outcome: 'SUCCEEDED',
      actorUserId: admin.userId,
      membershipId: admin.membershipId,
      targetType: 'user_account',
      targetId: targetUserId,
      reason: change.note,
      ...(change.correlationId ? { correlationId: change.correlationId } : {}),
    });
    return 'CHANGED';
  });
}

/** Most recent login events of one user, newest first (FR-SUP-003: IDs and codes only). */
export function listRecentLoginAttempts(
  prisma: PrismaClient,
  userId: string,
): Promise<LoginAttemptRow[]> {
  return prisma.authEvent.findMany({
    where: { userId },
    orderBy: { occurredAt: 'desc' },
    take: RECENT_ATTEMPTS,
    select: {
      occurredAt: true,
      action: true,
      outcome: true,
      reason: true,
      ipAddress: true,
      correlationId: true,
    },
  });
}
