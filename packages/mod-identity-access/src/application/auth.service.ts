// Login, hospital selection, session resolution and logout (UC-ACC-01, FR-ACC-001/002/005,
// ADR-004). Pre-hospital events go to auth_event; once a hospital is bound, the hospital's own
// audit trail also records the login (decision 1 of the T-ACC-01 plan). T-ACC-03 adds the login
// rate limit and the lock after repeated wrong passwords (FR-ACC-004, NFR-SEC-005, C-032).
// T-ACC-04 adds the second factor state of the session and its rotation (FR-ACC-006).
import { Inject, Injectable } from '@nestjs/common';
import { requiresSecondFactor } from '@hms/authz';
import type {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  MembershipSummary,
  MfaStatus,
  SessionResponse,
  UpdatePreferencesRequest,
} from '@hms/contracts';
import { withTenant, type PrismaClient } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { appendAuditEvent, PRISMA } from '@hms/platform';
import {
  assertAccountCanLogin,
  isAccountUsable,
  normalizeUsername,
  safeUsernameForLog,
} from '../domain/account-policy.js';
import {
  isSessionExpired,
  newSessionTimes,
  shouldTouch,
  slideIdleExpiry,
} from '../domain/session-policy.js';
import {
  loadMembershipAccess,
  type MembershipAccess,
} from '../infrastructure/access.repository.js';
import { csrfTokenFor } from '../infrastructure/csrf-token.js';
import { stateAfterFailedLogin } from '../domain/lockout-policy.js';
import { assertPasswordAcceptable } from '../domain/user-admin-policy.js';
import {
  appendAuthEvent,
  changeOwnPassword,
  applyFailedLogin,
  clearFailedLogins,
  findSessionByTokenHash,
  findUserById,
  findTenantIdForLogin,
  findUserByUsername,
  insertSession,
  isMembershipActive,
  listMembershipsForUser,
  markPasswordResetRequested,
  replaceSession,
  revokeSessionsOfUser,
  revokeSession,
  setPreferredLang,
  touchSession,
  type MembershipRecord,
  type UserRecord,
} from '../infrastructure/identity.repository.js';
import { findMfa } from '../infrastructure/mfa.repository.js';
import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '../infrastructure/password-hasher.js';
import { hashSessionToken, newSessionToken } from '../infrastructure/session-token.js';
import { AUTH_CONFIG, CLOCK, type AuthConfig } from './auth.config.js';
import { LOGIN_THROTTLE, type LoginThrottle } from './login-throttle.js';

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  membershipId: string | null;
  tokenHash: Uint8Array<ArrayBuffer>;
  absoluteExpiresAt: Date;
  /** When this session passed the second factor (T-ACC-04); null if it has not. */
  mfaVerifiedAt: Date | null;
  /** An administrator set the password; it must be changed first (T-ACC-05, FR-ACC-007). */
  passwordChangeRequired: boolean;
}

export interface RequestMeta {
  ipAddress?: string;
  correlationId?: string;
}

export interface IssuedSession {
  token: string;
  session: SessionResponse;
}

type Outcome = 'SUCCEEDED' | 'DENIED' | 'FAILED';

const INVALID = 'Invalid username or password';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGIN_THROTTLE) private readonly throttle: LoginThrottle,
  ) {}

  /**
   * Signed-out request for a new password (C-093, FR-ACC-012). It only raises a flag for the
   * administrator: no password, lock or session changes, so nobody can harm an account by asking.
   * The caller always gets the same answer, so it does not reveal which usernames exist, and it
   * shares the login rate limits, so it cannot be used to test usernames faster than login.
   */
  /** An unknown hospital looks exactly like an unknown user, so hospitals cannot be probed. */
  private async findUser(hospitalCode: string, username: string) {
    const tenantId = await findTenantIdForLogin(this.prisma, hospitalCode);
    return tenantId ? findUserByUsername(this.prisma, tenantId, username) : null;
  }

  async requestPasswordReset(input: ForgotPasswordRequest, meta: RequestMeta): Promise<void> {
    const username = normalizeUsername(input.username);
    const now = this.clock.now();
    await this.throttle.assertAllowed(meta.ipAddress, input.hospitalCode, username, now);
    const user = await this.findUser(input.hospitalCode, username);
    if (user && user.status !== 'DISABLED') {
      await markPasswordResetRequested(this.prisma, user.id, now);
      await this.authEvent('auth.password_reset.requested', 'SUCCEEDED', meta, {
        userId: user.id,
      });
      return;
    }
    const loggable = safeUsernameForLog(username);
    await this.authEvent('auth.password_reset.requested', 'DENIED', meta, {
      ...(user ? { userId: user.id } : {}),
      ...(loggable ? { usernameAttempted: loggable } : {}),
      reason: user ? 'ACCOUNT_DISABLED' : 'UNKNOWN_USER',
    });
  }

  async login(input: LoginRequest, meta: RequestMeta): Promise<IssuedSession> {
    const username = normalizeUsername(input.username);
    await this.throttle.assertAllowed(
      meta.ipAddress,
      input.hospitalCode,
      username,
      this.clock.now(),
    );
    const user = await this.findUser(input.hospitalCode, username);
    if (!user) {
      await verifyAgainstDummy(input.password);
      const loggable = safeUsernameForLog(username);
      await this.authEvent('auth.login.failed', 'FAILED', meta, {
        ...(loggable ? { usernameAttempted: loggable } : {}),
        reason: 'UNKNOWN_USER',
      });
      throw new DomainError('INVALID_CREDENTIALS', INVALID);
    }

    // The password is checked first, so lock and disabled states are only revealed to someone
    // who knows the password (otherwise status would leak to anyone who guesses a username).
    if (!(await verifyPassword(user.passwordHash, input.password))) {
      // The caller still gets INVALID_CREDENTIALS, also on the failure that locks: the status
      // is only told after a correct password (see above).
      await this.recordFailedAttempt(user.id, meta, 'auth.login.failed', 'BAD_PASSWORD');
      throw new DomainError('INVALID_CREDENTIALS', INVALID);
    }

    try {
      assertAccountCanLogin(user, this.clock.now());
    } catch (error) {
      const reason = error instanceof DomainError ? error.code : 'ACCOUNT_CHECK_FAILED';
      await this.authEvent('auth.login.failed', 'DENIED', meta, { userId: user.id, reason });
      throw error;
    }

    const memberships = await this.activeMemberships(user.id);
    if (memberships.length === 0) {
      await this.authEvent('auth.login.failed', 'DENIED', meta, {
        userId: user.id,
        reason: 'NO_ACTIVE_MEMBERSHIP',
      });
      throw new DomainError('MEMBERSHIP_NOT_ACTIVE', 'Access to this hospital is not active');
    }

    await clearFailedLogins(this.prisma, user.id);
    // FR-ACC-002: with exactly one hospital the choice is automatic (UC-ACC-01 A1).
    const bound = memberships.length === 1 ? (memberships[0] ?? null) : null;
    const issued = await this.startSession(user, memberships, bound, meta);
    await this.authEvent('auth.login.succeeded', 'SUCCEEDED', meta, { userId: user.id });
    return issued;
  }

  async selectMembership(
    ctx: AuthContext,
    membershipId: string,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const user = await this.requireUser(ctx.userId);
    const memberships = await this.activeMemberships(user.id);
    const chosen = memberships.find((m) => m.id === membershipId);
    // Another user's or an inactive membership looks the same as a missing one (D section 8.3).
    if (!chosen) throw new DomainError('NOT_FOUND', 'Membership not found');

    // ADR-004: a new session ID on hospital switch. The old token is revoked and the new
    // session created in one transaction, so a concurrent logout or switch cannot leave two
    // valid sessions or revive a logged-out one. The new session keeps the old absolute expiry
    // (FR-ACC-003, C-032).
    // A second factor passed in this login stays passed: it proves the user, not the hospital.
    return this.startSession(user, memberships, chosen, meta, {
      absoluteLimit: ctx.absoluteExpiresAt,
      replacing: ctx.tokenHash,
      mfaVerifiedAt: ctx.mfaVerifiedAt,
    });
  }

  /**
   * Replaces the session after the second factor (T-ACC-04): D section 7.1 rotates the session
   * ID at a privilege change, so a token seen before the step-up cannot use the stronger
   * session. Keeps the hospital and the absolute expiry.
   */
  async rotateAfterSecondFactor(ctx: AuthContext, meta: RequestMeta): Promise<IssuedSession> {
    const user = await this.requireUser(ctx.userId);
    const memberships = await this.activeMemberships(user.id);
    const bound = memberships.find((m) => m.id === ctx.membershipId) ?? null;
    return this.startSession(user, memberships, bound, meta, {
      absoluteLimit: ctx.absoluteExpiresAt,
      replacing: ctx.tokenHash,
      mfaVerifiedAt: this.clock.now(),
      auditLogin: false,
    });
  }

  /**
   * A wrong password or a wrong second-factor code (T-ACC-03, T-ACC-04): both count towards the
   * same lock (FR-ACC-004), so the 6-digit code cannot be guessed after the password.
   */
  async recordFailedAttempt(
    userId: string,
    meta: RequestMeta,
    action: 'auth.login.failed' | 'auth.mfa.failed' | 'auth.password.change_failed',
    reason: string,
  ): Promise<void> {
    const now = this.clock.now();
    const next = await applyFailedLogin(this.prisma, userId, (current) =>
      stateAfterFailedLogin(current, now, this.config.lockout),
    );
    await this.authEvent(action, 'FAILED', meta, { userId, reason });
    // FR-ACC-004: the lock itself is an event, so support can see when and from where the
    // last failure came.
    if (next?.status === 'LOCKED_TEMPORARY') {
      await this.authEvent('auth.account.locked', 'SUCCEEDED', meta, {
        userId,
        reason: 'FAILED_LOGINS',
      });
    }
  }

  async resolveSession(token: string): Promise<AuthContext | null> {
    const tokenHash = hashSessionToken(token);
    const session = await findSessionByTokenHash(this.prisma, tokenHash);
    const now = this.clock.now();
    if (!session || isSessionExpired(session, now)) return null;

    // Disabling the account or ending the hospital access must stop an open session on the
    // next request (FR-ACC-010, ADR-004).
    // The session is also revoked for good here, so restoring access later cannot revive an
    // old (or stolen) cookie. The database also revokes at the moment access is removed
    // (migration revoke_sessions_on_access_change); this covers anything that slipped through.
    const user = await findUserById(this.prisma, session.userId);
    const accessOk =
      user !== null &&
      isAccountUsable(user, now) &&
      (!session.membershipId ||
        (await isMembershipActive(this.prisma, session.userId, session.membershipId)));
    if (!accessOk) {
      await revokeSession(this.prisma, tokenHash, now);
      return null;
    }

    if (shouldTouch(session.lastSeenAt, now)) {
      const idleExpiresAt = slideIdleExpiry(session, now, this.config.timeouts);
      await touchSession(this.prisma, tokenHash, now, idleExpiresAt);
    }
    return {
      userId: session.userId,
      tenantId: session.tenantId,
      membershipId: session.membershipId,
      tokenHash,
      absoluteExpiresAt: session.absoluteExpiresAt,
      mfaVerifiedAt: session.mfaVerifiedAt,
      // accessOk above guarantees the account was found.
      passwordChangeRequired: user?.mustChangePassword ?? false,
    };
  }

  /**
   * The user's own password change (T-ACC-05, FR-ACC-007; UC-ACC-01 A1). A wrong current
   * password counts towards the lock. Other sessions end; this one is replaced (new ID).
   */
  async changePassword(
    ctx: AuthContext,
    input: ChangePasswordRequest,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const user = await this.requireUser(ctx.userId);
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      await this.recordFailedAttempt(user.id, meta, 'auth.password.change_failed', 'BAD_PASSWORD');
      // Not INVALID_CREDENTIALS (401): the session is fine, only this field is wrong.
      throw new DomainError('VALIDATION_FAILED', 'Current password is not correct', {
        fields: [{ path: 'currentPassword', message: 'Not correct' }],
      });
    }
    assertPasswordAcceptable(input.newPassword, user.username, input.currentPassword);
    const now = this.clock.now();
    await changeOwnPassword(this.prisma, user.id, await hashPassword(input.newPassword), now);
    await revokeSessionsOfUser(this.prisma, user.id, now, ctx.tokenHash);
    await this.authEvent('auth.password.changed', 'SUCCEEDED', meta, { userId: user.id });

    const updated = await this.requireUser(user.id);
    const memberships = await this.activeMemberships(user.id);
    const bound = memberships.find((m) => m.id === ctx.membershipId) ?? null;
    return this.startSession(updated, memberships, bound, meta, {
      absoluteLimit: ctx.absoluteExpiresAt,
      replacing: ctx.tokenHash,
      mfaVerifiedAt: ctx.mfaVerifiedAt,
      auditLogin: false,
    });
  }

  async describeSession(ctx: AuthContext, token: string): Promise<SessionResponse> {
    const user = await this.requireUser(ctx.userId);
    const session = await findSessionByTokenHash(this.prisma, ctx.tokenHash);
    if (!session) throw new DomainError('UNAUTHENTICATED', 'Session ended');
    const memberships = await this.activeMemberships(user.id);
    const bound = memberships.find((m) => m.id === ctx.membershipId) ?? null;
    return this.toResponse(user, memberships, bound, token, session);
  }

  async updatePreferences(
    ctx: AuthContext,
    input: UpdatePreferencesRequest,
    token: string,
  ): Promise<SessionResponse> {
    await setPreferredLang(this.prisma, ctx.userId, input.preferredLang);
    return this.describeSession(ctx, token);
  }

  async logout(ctx: AuthContext, meta: RequestMeta): Promise<void> {
    await revokeSession(this.prisma, ctx.tokenHash, this.clock.now());
    if (ctx.tenantId && ctx.membershipId) {
      await this.tenantAudit(ctx.tenantId, ctx.userId, ctx.membershipId, 'auth.logout', meta);
    }
    await this.authEvent('auth.logout', 'SUCCEEDED', meta, { userId: ctx.userId });
  }

  private async startSession(
    user: UserRecord,
    memberships: MembershipRecord[],
    bound: MembershipRecord | null,
    meta: RequestMeta,
    options: {
      absoluteLimit?: Date;
      replacing?: Uint8Array<ArrayBuffer>;
      mfaVerifiedAt?: Date | null;
      /** False for a rotation inside the same login (second factor), which is not a new login. */
      auditLogin?: boolean;
    } = {},
  ): Promise<IssuedSession> {
    const { absoluteLimit, replacing, mfaVerifiedAt = null, auditLogin = true } = options;
    const token = newSessionToken();
    const now = this.clock.now();
    const fresh = newSessionTimes(now, this.config.timeouts);
    const times = absoluteLimit
      ? {
          absoluteExpiresAt: absoluteLimit,
          idleExpiresAt: new Date(Math.min(fresh.idleExpiresAt.getTime(), absoluteLimit.getTime())),
        }
      : fresh;
    const row = {
      tokenHash: hashSessionToken(token),
      userId: user.id,
      tenantId: bound?.tenantId ?? null,
      membershipId: bound?.id ?? null,
      createdAt: now,
      mfaVerifiedAt,
      ...times,
    };
    if (replacing) {
      if (!(await replaceSession(this.prisma, replacing, now, row))) {
        throw new DomainError('UNAUTHENTICATED', 'Session ended');
      }
    } else {
      await insertSession(this.prisma, row);
    }
    if (bound && auditLogin) {
      await this.tenantAudit(bound.tenantId, user.id, bound.id, 'auth.login.succeeded', meta);
    }
    const session = await this.toResponse(user, memberships, bound, token, {
      ...times,
      mfaVerifiedAt,
    });
    return { token, session };
  }

  private async toResponse(
    user: UserRecord,
    memberships: MembershipRecord[],
    bound: MembershipRecord | null,
    token: string,
    times: { idleExpiresAt: Date; absoluteExpiresAt: Date; mfaVerifiedAt: Date | null },
  ): Promise<SessionResponse> {
    // Before a hospital is chosen the roles are unknown: no permissions, no MFA requirement.
    const access = bound
      ? await loadMembershipAccess(this.prisma, {
          tenantId: bound.tenantId,
          userId: user.id,
          membershipId: bound.id,
        })
      : null;
    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        preferredLang: user.preferredLang === 'bn_BD' ? 'bn-BD' : 'en',
      },
      memberships: memberships.map(toSummary),
      activeMembershipId: bound?.id ?? null,
      csrfToken: csrfTokenFor(token, this.config.csrfSecret),
      idleExpiresAt: times.idleExpiresAt.toISOString(),
      absoluteExpiresAt: times.absoluteExpiresAt.toISOString(),
      mfa: await this.mfaStatus(user.id, access, times.mfaVerifiedAt),
      passwordChangeRequired: user.mustChangePassword,
      permissions: access ? [...access.granted].sort() : [],
    };
  }

  /** What the UI needs to route to the MFA screen; the API enforces it in PermissionGuard. */
  private async mfaStatus(
    userId: string,
    access: MembershipAccess | null,
    verifiedAt: Date | null,
  ): Promise<MfaStatus> {
    const required = access ? requiresSecondFactor(access) : false;
    const mfa = await findMfa(this.prisma, userId);
    return { required, enrolled: mfa?.enabledAt != null, verified: verifiedAt !== null };
  }

  private async activeMemberships(userId: string): Promise<MembershipRecord[]> {
    const all = await listMembershipsForUser(this.prisma, userId);
    return all.filter((m) => m.status === 'ACTIVE');
  }

  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await findUserById(this.prisma, userId);
    if (!user) throw new DomainError('UNAUTHENTICATED', 'Session ended');
    return user;
  }

  private tenantAudit(
    tenantId: string,
    userId: string,
    membershipId: string,
    action: string,
    meta: RequestMeta,
  ): Promise<void> {
    return withTenant(this.prisma, { tenantId, userId }, (tx) =>
      appendAuditEvent(tx, {
        tenantId,
        action,
        outcome: 'SUCCEEDED',
        actorUserId: userId,
        membershipId,
        ...(meta.correlationId ? { correlationId: meta.correlationId } : {}),
      }),
    );
  }

  private authEvent(
    action: string,
    outcome: Outcome,
    meta: RequestMeta,
    extra: { userId?: string; usernameAttempted?: string; reason?: string },
  ): Promise<void> {
    return appendAuthEvent(this.prisma, { action, outcome, ...meta, ...extra });
  }
}

function toSummary(m: MembershipRecord): MembershipSummary {
  return {
    id: m.id,
    tenantId: m.tenantId,
    tenantNameEn: m.tenantNameEn,
    tenantNameBn: m.tenantNameBn,
  };
}
