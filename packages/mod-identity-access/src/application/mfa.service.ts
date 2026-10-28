// TOTP second factor: enrolment, confirmation and the step-up check after login (T-ACC-04;
// FR-ACC-006; UC-ACC-01 step 3; AT-ACC-009, AT-ACC-010; C-032; ADR-004). A wrong code counts
// towards the account lock like a wrong password. Every success rotates the session ID.
import { Inject, Injectable } from '@nestjs/common';
import type { MfaEnrolmentResponse, MfaVerifyRequest } from '@hms/contracts';
import type { PrismaClient } from '@hms/database';
import { DomainError, type Clock } from '@hms/domain-kernel';
import { PRISMA } from '@hms/platform';
import { appendAuthEvent, findUserById } from '../infrastructure/identity.repository.js';
import {
  consumeRecoveryCode,
  consumeTotpStep,
  enableMfa,
  findMfa,
  savePendingMfa,
} from '../infrastructure/mfa.repository.js';
import { hashRecoveryCode, newRecoveryCodes } from '../infrastructure/recovery-codes.js';
import { openSecret, sealSecret } from '../infrastructure/secret-box.js';
import { matchTotp, newTotpSecret, otpauthUri, toBase32 } from '../infrastructure/totp.js';
import { AUTH_CONFIG, CLOCK, type AuthConfig } from './auth.config.js';
import {
  AuthService,
  type AuthContext,
  type IssuedSession,
  type RequestMeta,
} from './auth.service.js';

const INVALID_CODE = 'The code is not correct';

export interface ConfirmedEnrolment {
  issued: IssuedSession;
  recoveryCodes: string[];
}

@Injectable()
export class MfaService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly auth: AuthService,
  ) {}

  /** Creates a new secret, replacing an unconfirmed one; an enabled factor is never replaced. */
  async startEnrolment(ctx: AuthContext): Promise<MfaEnrolmentResponse> {
    const user = await findUserById(this.prisma, ctx.userId);
    if (!user) throw new DomainError('UNAUTHENTICATED', 'Session ended');
    const secret = newTotpSecret();
    const sealed = sealSecret(this.config.mfa.encryptionKey, secret);
    if (!(await savePendingMfa(this.prisma, ctx.userId, sealed))) {
      throw new DomainError('INVALID_TRANSITION', 'A second factor is already set up');
    }
    return {
      secret: toBase32(secret),
      otpauthUri: otpauthUri({ issuer: this.config.mfa.issuer, account: user.username, secret }),
    };
  }

  /** The first correct code turns the factor on and returns the one-time recovery codes. */
  async confirmEnrolment(
    ctx: AuthContext,
    code: string,
    meta: RequestMeta,
  ): Promise<ConfirmedEnrolment> {
    const mfa = await findMfa(this.prisma, ctx.userId);
    if (!mfa || mfa.enabledAt) {
      throw new DomainError('INVALID_TRANSITION', 'There is no set-up waiting for a code');
    }
    const now = this.clock.now();
    const step = matchTotp(this.secretOf(mfa.secretCiphertext), code, now);
    if (step === null) return this.refuse(ctx, meta, 'BAD_CODE');

    const recoveryCodes = newRecoveryCodes();
    const enabled = await enableMfa(this.prisma, ctx.userId, {
      now,
      step,
      recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    });
    if (!enabled) throw new DomainError('INVALID_TRANSITION', 'The set-up was already finished');
    await this.event('auth.mfa.enrolled', ctx, meta);
    return { issued: await this.auth.rotateAfterSecondFactor(ctx, meta), recoveryCodes };
  }

  /** Step-up after login with a code from the app or one recovery code (AT-ACC-009, -010). */
  async verify(
    ctx: AuthContext,
    input: MfaVerifyRequest,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const mfa = await findMfa(this.prisma, ctx.userId);
    if (!mfa?.enabledAt) {
      throw new DomainError('INVALID_TRANSITION', 'Set up the authenticator app first');
    }
    const now = this.clock.now();
    if ('code' in input) {
      const step = matchTotp(this.secretOf(mfa.secretCiphertext), input.code, now);
      // A matching code from an already used time step is a replay (AT-ACC-010).
      const accepted = step !== null && (await consumeTotpStep(this.prisma, ctx.userId, step));
      if (!accepted) return this.refuse(ctx, meta, step === null ? 'BAD_CODE' : 'CODE_REUSED');
      await this.event('auth.mfa.verified', ctx, meta);
    } else {
      const hash = hashRecoveryCode(input.recoveryCode);
      if (!(await consumeRecoveryCode(this.prisma, ctx.userId, hash, now))) {
        return this.refuse(ctx, meta, 'BAD_RECOVERY_CODE');
      }
      await this.event('auth.mfa.verified', ctx, meta, 'RECOVERY_CODE');
    }
    return this.auth.rotateAfterSecondFactor(ctx, meta);
  }

  private secretOf(sealed: Buffer): Buffer {
    return openSecret(this.config.mfa.encryptionKey, sealed);
  }

  private async refuse(ctx: AuthContext, meta: RequestMeta, reason: string): Promise<never> {
    await this.auth.recordFailedAttempt(ctx.userId, meta, 'auth.mfa.failed', reason);
    throw new DomainError('MFA_CODE_INVALID', INVALID_CODE);
  }

  private event(
    action: string,
    ctx: AuthContext,
    meta: RequestMeta,
    reason?: string,
  ): Promise<void> {
    return appendAuthEvent(this.prisma, {
      action,
      outcome: 'SUCCEEDED',
      userId: ctx.userId,
      ...meta,
      ...(reason ? { reason } : {}),
    });
  }
}
