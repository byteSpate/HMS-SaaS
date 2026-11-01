// User and membership administration for hospital administrators (T-ACC-05; FR-ACC-007,
// FR-ACC-008, FR-ACC-010; AT-ACC-011; SCR-22). Users outside the administrator's hospital are
// NOT_FOUND. An administrator never changes their own account here (UC-ACC-02).
import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminUser,
  AdminUserList,
  CreateUserRequest,
  SetMembershipStatusRequest,
} from '@hms/contracts';
import type { PrismaClient } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { PRISMA } from '@hms/platform';
import {
  assertMembershipTransition,
  assertNotOwnAccount,
  assertPasswordAcceptable,
} from '../domain/user-admin-policy.js';
import type { AdminRef } from '../infrastructure/account-lock.repository.js';
import { hashPassword } from '../infrastructure/password-hasher.js';
import {
  createUser,
  listUsers,
  resetMfa,
  resetPassword,
  setMembershipStatus,
  setUserRoles,
  type AdminUserRow,
} from '../infrastructure/user-admin.repository.js';
import { CLOCK } from './auth.config.js';

const notFound = () => new DomainError('NOT_FOUND', 'User not found');
const roleNotFound = () =>
  new DomainError('VALIDATION_FAILED', 'Unknown role', {
    fields: [{ path: 'roleIds', message: 'One of the roles does not exist in this hospital' }],
  });

function toAdminUser(row: AdminUserRow): AdminUser {
  return {
    ...row,
    lockedUntil: row.lockedUntil?.toISOString() ?? null,
    passwordResetRequestedAt: row.passwordResetRequestedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class UserAdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(admin: AdminRef): Promise<AdminUserList> {
    const { users, roles } = await listUsers(this.prisma, admin);
    return { users: users.map(toAdminUser), roles };
  }

  async create(
    admin: AdminRef,
    input: CreateUserRequest,
    correlationId?: string,
  ): Promise<AdminUser> {
    assertPasswordAcceptable(input.temporaryPassword, input.username);
    const result = await createUser(
      this.prisma,
      admin,
      {
        username: input.username,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.temporaryPassword),
        roleIds: input.roleIds,
      },
      { ...(correlationId ? { correlationId } : {}) },
    );
    if (result.kind === 'USERNAME_TAKEN') {
      throw new DomainError('USERNAME_TAKEN', 'This username is already in use');
    }
    if (result.kind === 'ROLE_NOT_FOUND') throw roleNotFound();
    return this.one(admin, result.userId);
  }

  async resetPassword(
    admin: AdminRef,
    targetUserId: string,
    temporaryPassword: string,
    reason: string,
    correlationId?: string,
  ): Promise<AdminUser> {
    assertNotOwnAccount(admin.userId, targetUserId);
    const target = await this.one(admin, targetUserId);
    assertPasswordAcceptable(temporaryPassword, target.username);
    const done = await resetPassword(
      this.prisma,
      admin,
      targetUserId,
      await hashPassword(temporaryPassword),
      this.clock.now(),
      { reason, ...(correlationId ? { correlationId } : {}) },
    );
    if (!done) throw notFound();
    return this.one(admin, targetUserId);
  }

  async setMembershipStatus(
    admin: AdminRef,
    targetUserId: string,
    input: SetMembershipStatusRequest,
    correlationId?: string,
  ): Promise<AdminUser> {
    assertNotOwnAccount(admin.userId, targetUserId);
    const done = await setMembershipStatus(
      this.prisma,
      admin,
      targetUserId,
      input.status,
      (current) => assertMembershipTransition(current.status, input.status),
      { reason: input.reason, ...(correlationId ? { correlationId } : {}) },
    );
    if (!done) throw notFound();
    return this.one(admin, targetUserId);
  }

  async setRoles(
    admin: AdminRef,
    targetUserId: string,
    roleIds: string[],
    correlationId?: string,
  ): Promise<AdminUser> {
    assertNotOwnAccount(admin.userId, targetUserId);
    const result = await setUserRoles(this.prisma, admin, targetUserId, roleIds, {
      ...(correlationId ? { correlationId } : {}),
    });
    if (result === 'NOT_FOUND') throw notFound();
    if (result === 'ROLE_NOT_FOUND') throw roleNotFound();
    return this.one(admin, targetUserId);
  }

  async resetMfa(
    admin: AdminRef,
    targetUserId: string,
    reason: string,
    correlationId?: string,
  ): Promise<AdminUser> {
    assertNotOwnAccount(admin.userId, targetUserId);
    const result = await resetMfa(this.prisma, admin, targetUserId, this.clock.now(), {
      reason,
      ...(correlationId ? { correlationId } : {}),
    });
    if (result === 'NOT_FOUND') throw notFound();
    if (result === 'NOT_ENROLLED') {
      throw new DomainError('INVALID_TRANSITION', 'The user has no second factor to reset');
    }
    return this.one(admin, targetUserId);
  }

  private async one(admin: AdminRef, userId: string): Promise<AdminUser> {
    const { users } = await listUsers(this.prisma, admin);
    const user = users.find((u) => u.userId === userId);
    if (!user) throw notFound();
    return toAdminUser(user);
  }
}
