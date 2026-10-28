// Prisma access for login and sessions. user_account and user_session are not tenant-scoped
// (looked up before a hospital is known); memberships are read with the user context (RLS).
import { withUserContext, type PrismaClient } from '@hms/database';
import type { AccountStatus } from '../domain/account-policy.js';
import { unlockedState, type LockState } from '../domain/lockout-policy.js';

export interface CurrentLockRow {
  status: AccountStatus;
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  status: AccountStatus;
  lockedUntil: Date | null;
  failedAttempts: number;
  preferredLang: 'bn_BD' | 'en';
}

export interface MembershipRecord {
  id: string;
  tenantId: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  tenantNameEn: string | null;
  tenantNameBn: string | null;
}

export interface SessionRecord {
  tokenHash: Uint8Array<ArrayBuffer>;
  userId: string;
  tenantId: string | null;
  membershipId: string | null;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  mfaVerifiedAt: Date | null;
}

export interface NewSession {
  tokenHash: Uint8Array<ArrayBuffer>;
  userId: string;
  tenantId: string | null;
  membershipId: string | null;
  createdAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  /** Set when the user already passed the second factor in this login (T-ACC-04). */
  mfaVerifiedAt: Date | null;
}

export interface AuthEventInput {
  action: string;
  outcome: 'SUCCEEDED' | 'DENIED' | 'FAILED';
  userId?: string;
  usernameAttempted?: string;
  reason?: string;
  ipAddress?: string;
  correlationId?: string;
}

export function findUserByUsername(
  prisma: PrismaClient,
  username: string,
): Promise<UserRecord | null> {
  return prisma.userAccount.findUnique({ where: { username } });
}

export function findUserById(prisma: PrismaClient, id: string): Promise<UserRecord | null> {
  return prisma.userAccount.findUnique({ where: { id } });
}

/**
 * Applies a failed login under a row lock (T-ACC-03). Concurrent wrong passwords queue on the
 * lock, so none of them is lost and an attacker cannot get extra tries by sending them in
 * parallel. `decide` is the domain rule (stateAfterFailedLogin); null means no change.
 */
export async function applyFailedLogin(
  prisma: PrismaClient,
  userId: string,
  decide: (current: CurrentLockRow) => LockState | null,
): Promise<LockState | null> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<CurrentLockRow[]>`
        SELECT status::text AS status, failed_attempts AS "failedAttempts",
               locked_until AS "lockedUntil"
          FROM hms.user_account WHERE id = ${userId}::uuid FOR UPDATE`;
      const current = rows[0];
      const next = current ? decide(current) : null;
      if (next) await tx.userAccount.update({ where: { id: userId }, data: next });
      return next;
    },
    { maxWait: 5_000, timeout: 5_000 },
  );
}

/**
 * After a correct password: clears the failure counter and an expired temporary lock. An
 * administrator's lock or a disabled account is never touched here.
 */
export async function clearFailedLogins(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.userAccount.updateMany({
    where: { id: userId, status: { in: ['ACTIVE', 'LOCKED_TEMPORARY'] } },
    data: unlockedState(),
  });
}

/** `bn-BD` is stored as the enum value `bn_BD` (Prisma enum names cannot contain a hyphen). */
export async function setPreferredLang(
  prisma: PrismaClient,
  userId: string,
  preferredLang: 'bn-BD' | 'en',
): Promise<void> {
  await prisma.userAccount.update({
    where: { id: userId },
    data: { preferredLang: preferredLang === 'bn-BD' ? 'bn_BD' : 'en', version: { increment: 1 } },
  });
}

export async function listMembershipsForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<MembershipRecord[]> {
  const rows = await withUserContext(prisma, userId, (tx) =>
    tx.membership.findMany({
      // Only active access is ever offered; inactive hospitals stay hidden (and their names
      // are hidden from the user by the tenant policy).
      where: { userId, status: 'ACTIVE' },
      include: { tenant: { select: { nameEn: true, nameBn: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  );
  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    status: row.status,
    tenantNameEn: row.tenant.nameEn,
    tenantNameBn: row.tenant.nameBn,
  }));
}

/** Whether the membership still belongs to this user and is active (checked on every request). */
export async function isMembershipActive(
  prisma: PrismaClient,
  userId: string,
  membershipId: string,
): Promise<boolean> {
  const row = await withUserContext(prisma, userId, (tx) =>
    tx.membership.findFirst({
      where: { id: membershipId, userId, status: 'ACTIVE' },
      select: { id: true },
    }),
  );
  return row !== null;
}

export async function insertSession(prisma: PrismaClient, session: NewSession): Promise<void> {
  await prisma.userSession.create({ data: { ...session, lastSeenAt: session.createdAt } });
}

export function findSessionByTokenHash(
  prisma: PrismaClient,
  tokenHash: Uint8Array<ArrayBuffer>,
): Promise<SessionRecord | null> {
  return prisma.userSession.findUnique({ where: { tokenHash } });
}

/**
 * Replaces a session with a new one in ONE transaction (hospital switch, ADR-004). The old
 * session is revoked only if it is still valid; if a logout or another switch got there
 * first, nothing is created and false is returned. The row lock taken by the update makes
 * two simultaneous switches queue up, so only the first can win.
 */
export async function replaceSession(
  prisma: PrismaClient,
  oldTokenHash: Uint8Array<ArrayBuffer>,
  now: Date,
  replacement: NewSession,
): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const revoked = await tx.userSession.updateMany({
        where: {
          tokenHash: oldTokenHash,
          revokedAt: null,
          idleExpiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) return false;
      await tx.userSession.create({
        data: { ...replacement, lastSeenAt: replacement.createdAt },
      });
      return true;
    },
    { maxWait: 5_000, timeout: 5_000 },
  );
}

export async function touchSession(
  prisma: PrismaClient,
  tokenHash: Uint8Array<ArrayBuffer>,
  lastSeenAt: Date,
  idleExpiresAt: Date,
): Promise<void> {
  await prisma.userSession.update({ where: { tokenHash }, data: { lastSeenAt, idleExpiresAt } });
}

export async function revokeSession(
  prisma: PrismaClient,
  tokenHash: Uint8Array<ArrayBuffer>,
  at: Date,
): Promise<void> {
  await prisma.userSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: at },
  });
}

export async function appendAuthEvent(prisma: PrismaClient, event: AuthEventInput): Promise<void> {
  await prisma.authEvent.create({ data: event });
}
