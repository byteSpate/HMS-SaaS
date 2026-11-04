// Prisma access for user and membership administration (T-ACC-05; FR-ACC-007, FR-ACC-008,
// FR-ACC-010; SCR-22). Everything runs in the administrator's hospital (withTenant): RLS limits
// memberships and roles to it, so another hospital's users and roles are simply not found.
// Each change writes its audit event in the same transaction (FR-AUD-001).
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { appendAuditEvent } from '@hms/platform';
import type { AccountStatus } from '../domain/account-policy.js';
import type { AdminRef } from './account-lock.repository.js';
import { assertAccountNotShared } from './shared-account.js';

export interface AdminUserRow {
  userId: string;
  username: string;
  displayName: string;
  accountStatus: AccountStatus;
  lockedUntil: Date | null;
  membershipId: string;
  membershipStatus: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  roles: { id: string; code: string; nameEn: string; nameBn: string | null }[];
  mfaEnrolled: boolean;
  mustChangePassword: boolean;
  passwordResetRequestedAt: Date | null;
}

export interface RoleChoice {
  id: string;
  code: string;
  nameEn: string;
  nameBn: string | null;
}

export interface AuditNote {
  correlationId?: string;
  reason?: string;
  details?: Record<string, string | number | boolean | null>;
}

const ROLE_SELECT = { id: true, code: true, nameEn: true, nameBn: true } as const;

function scoped<T>(prisma: PrismaClient, admin: AdminRef, fn: (tx: TenantTx) => Promise<T>) {
  return withTenant(prisma, { tenantId: admin.tenantId, userId: admin.userId }, fn);
}

export function auditAdminChange(
  tx: TenantTx,
  admin: AdminRef,
  action: string,
  targetType: 'user_account' | 'membership' | 'role',
  targetId: string,
  note: AuditNote,
): Promise<void> {
  return appendAuditEvent(tx, {
    tenantId: admin.tenantId,
    action,
    outcome: 'SUCCEEDED',
    actorUserId: admin.userId,
    membershipId: admin.membershipId,
    targetType,
    targetId,
    ...(note.reason ? { reason: note.reason } : {}),
    ...(note.correlationId ? { correlationId: note.correlationId } : {}),
    ...(note.details ? { details: note.details } : {}),
  });
}

/** The target's membership in the administrator's hospital, or null (not visible = not found). */
function membershipOf(tx: TenantTx, userId: string) {
  return tx.membership.findFirst({ where: { userId }, select: { id: true, status: true } });
}

/** Whether every role ID is one of this hospital's roles. */
async function rolesExist(tx: TenantTx, roleIds: readonly string[]): Promise<boolean> {
  if (roleIds.length === 0) return true;
  const found = await tx.role.count({ where: { id: { in: [...roleIds] } } });
  return found === new Set(roleIds).size;
}

export async function listUsers(
  prisma: PrismaClient,
  admin: AdminRef,
): Promise<{ users: AdminUserRow[]; roles: RoleChoice[] }> {
  return scoped(prisma, admin, async (tx) => {
    const memberships = await tx.membership.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            status: true,
            lockedUntil: true,
            mustChangePassword: true,
            passwordResetRequestedAt: true,
            mfa: { select: { enabledAt: true } },
          },
        },
        roles: { select: { role: { select: ROLE_SELECT } } },
      },
    });
    const roles = await tx.role.findMany({ orderBy: { code: 'asc' }, select: ROLE_SELECT });
    const users = memberships.map((m) => ({
      userId: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      accountStatus: m.user.status,
      lockedUntil: m.user.lockedUntil,
      membershipId: m.id,
      membershipStatus: m.status,
      roles: m.roles.map((r) => r.role),
      mfaEnrolled: m.user.mfa?.enabledAt != null,
      mustChangePassword: m.user.mustChangePassword,
      passwordResetRequestedAt: m.user.passwordResetRequestedAt,
    }));
    return { users, roles };
  });
}

export type CreateUserResult =
  { kind: 'CREATED'; userId: string } | { kind: 'USERNAME_TAKEN' } | { kind: 'ROLE_NOT_FOUND' };

export async function createUser(
  prisma: PrismaClient,
  admin: AdminRef,
  input: { username: string; displayName: string; passwordHash: string; roleIds: string[] },
  note: AuditNote,
): Promise<CreateUserResult> {
  return scoped(prisma, admin, async (tx) => {
    const taken = await tx.userAccount.findUnique({
      where: { username: input.username },
      select: { id: true },
    });
    if (taken) return { kind: 'USERNAME_TAKEN' };
    if (!(await rolesExist(tx, input.roleIds))) return { kind: 'ROLE_NOT_FOUND' };

    const user = await tx.userAccount.create({
      data: {
        username: input.username,
        displayName: input.displayName,
        passwordHash: input.passwordHash,
        // FR-ACC-007: the administrator knows this password, so the user must replace it.
        mustChangePassword: true,
      },
      select: { id: true },
    });
    const membership = await tx.membership.create({
      data: { tenantId: admin.tenantId, userId: user.id },
      select: { id: true },
    });
    await tx.membershipRole.createMany({
      data: input.roleIds.map((roleId) => ({
        tenantId: admin.tenantId,
        membershipId: membership.id,
        roleId,
      })),
    });
    await auditAdminChange(tx, admin, 'admin.user.created', 'user_account', user.id, {
      ...note,
      details: { membershipId: membership.id, roles: input.roleIds.join(',') },
    });
    return { kind: 'CREATED', userId: user.id };
  });
}

/** Sets a temporary password, forces a change at next login and ends open sessions. */
export async function resetPassword(
  prisma: PrismaClient,
  admin: AdminRef,
  targetUserId: string,
  passwordHash: string,
  now: Date,
  note: AuditNote,
): Promise<boolean> {
  return scoped(prisma, admin, async (tx) => {
    if (!(await membershipOf(tx, targetUserId))) return false;
    await assertAccountNotShared(tx, targetUserId);
    await tx.userAccount.update({
      where: { id: targetUserId },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordResetRequestedAt: null,
        version: { increment: 1 },
      },
    });
    await tx.userSession.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });
    await auditAdminChange(
      tx,
      admin,
      'admin.user.password_reset',
      'user_account',
      targetUserId,
      note,
    );
    return true;
  });
}

export type MembershipLookup = { id: string; status: AdminUserRow['membershipStatus'] };

/**
 * Changes the membership status after `check` approves the transition. The database trigger
 * membership_access_removed revokes the user's sessions in this hospital when it stops being
 * ACTIVE, so the change takes effect on the next request (FR-ACC-010, AT-ACC-011).
 */
export async function setMembershipStatus(
  prisma: PrismaClient,
  admin: AdminRef,
  targetUserId: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED',
  check: (current: MembershipLookup) => void,
  note: AuditNote,
): Promise<boolean> {
  return scoped(prisma, admin, async (tx) => {
    const membership = await membershipOf(tx, targetUserId);
    if (!membership) return false;
    check(membership);
    await tx.membership.update({
      where: { id: membership.id },
      data: { status, version: { increment: 1 } },
    });
    await auditAdminChange(
      tx,
      admin,
      'admin.membership.status_changed',
      'membership',
      membership.id,
      {
        ...note,
        details: { userId: targetUserId, from: membership.status, to: status },
      },
    );
    return true;
  });
}

export type SetRolesResult = 'CHANGED' | 'NOT_FOUND' | 'ROLE_NOT_FOUND';

/** Replaces the membership's roles; permission changes apply on the user's next request. */
export async function setUserRoles(
  prisma: PrismaClient,
  admin: AdminRef,
  targetUserId: string,
  roleIds: string[],
  note: AuditNote,
): Promise<SetRolesResult> {
  return scoped(prisma, admin, async (tx) => {
    const membership = await membershipOf(tx, targetUserId);
    if (!membership) return 'NOT_FOUND';
    if (!(await rolesExist(tx, roleIds))) return 'ROLE_NOT_FOUND';
    await tx.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await tx.membershipRole.createMany({
      data: roleIds.map((roleId) => ({
        tenantId: admin.tenantId,
        membershipId: membership.id,
        roleId,
      })),
    });
    await auditAdminChange(
      tx,
      admin,
      'admin.membership.roles_changed',
      'membership',
      membership.id,
      {
        ...note,
        details: { userId: targetUserId, roles: roleIds.join(',') },
      },
    );
    return 'CHANGED';
  });
}

export type ResetMfaResult = 'RESET' | 'NOT_FOUND' | 'NOT_ENROLLED';

/** Removes a lost second factor and its recovery codes; the user enrols again at next login. */
export async function resetMfa(
  prisma: PrismaClient,
  admin: AdminRef,
  targetUserId: string,
  now: Date,
  note: AuditNote,
): Promise<ResetMfaResult> {
  return scoped(prisma, admin, async (tx) => {
    if (!(await membershipOf(tx, targetUserId))) return 'NOT_FOUND';
    await assertAccountNotShared(tx, targetUserId);
    const removed = await tx.userMfa.deleteMany({ where: { userId: targetUserId } });
    if (removed.count === 0) return 'NOT_ENROLLED';
    await tx.userMfaRecoveryCode.deleteMany({ where: { userId: targetUserId } });
    await tx.userSession.updateMany({
      where: { userId: targetUserId, revokedAt: null },
      data: { revokedAt: now },
    });
    await auditAdminChange(tx, admin, 'admin.user.mfa_reset', 'user_account', targetUserId, note);
    return 'RESET';
  });
}
