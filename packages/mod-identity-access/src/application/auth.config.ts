// Login settings. Defaults are the C-032 decisions; per-hospital overrides (CP-12) come with
// policy versions (T-PLT-05). Lockout and login rate limits: T-ACC-03, NFR-SEC-005. Second
// factor (TOTP): T-ACC-04, FR-ACC-006.
import type { RateLimitRule } from '@hms/platform';
import type { LockoutPolicy } from '../domain/lockout-policy.js';
import { parseMfaKey } from '../infrastructure/secret-box.js';
import type { SessionTimeouts } from '../domain/session-policy.js';

export interface LoginRateLimits {
  perIp: RateLimitRule;
  perAccount: RateLimitRule;
}

/** T-ACC-04: TOTP secrets are encrypted with this key; the issuer names the app in authenticators. */
export interface MfaConfig {
  encryptionKey: Buffer;
  issuer: string;
}

export interface AuthConfig {
  timeouts: SessionTimeouts;
  csrfSecret: string;
  lockout: LockoutPolicy;
  loginRateLimits: LoginRateLimits;
  mfa: MfaConfig;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
export const CLOCK = Symbol('CLOCK');

const FIFTEEN_MINUTES = 15 * 60_000;

/**
 * Login rate limits (AT-ACC-007). Staff of one hospital often share one public IP behind the
 * hospital router, so the IP limit is wide enough for a shift change; the account limit is
 * tight, and the lockout (5 wrong passwords) normally stops a guesser first.
 */
export const DEFAULT_LOGIN_RATE_LIMITS: LoginRateLimits = {
  perIp: { limit: 200, windowMs: FIFTEEN_MINUTES },
  perAccount: { limit: 10, windowMs: FIFTEEN_MINUTES },
};

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const csrfSecret = env.CSRF_SECRET ?? '';
  if (csrfSecret.length < 32) throw new Error('CSRF_SECRET must be at least 32 characters');
  return {
    csrfSecret,
    timeouts: {
      idleMinutes: positiveNumber(env.SESSION_IDLE_TIMEOUT_MIN, 60, 'SESSION_IDLE_TIMEOUT_MIN'),
      absoluteHours: positiveNumber(
        env.SESSION_ABSOLUTE_TIMEOUT_H,
        12,
        'SESSION_ABSOLUTE_TIMEOUT_H',
      ),
    },
    lockout: {
      maxFailedAttempts: positiveNumber(env.LOGIN_LOCKOUT_ATTEMPTS, 5, 'LOGIN_LOCKOUT_ATTEMPTS'),
      lockMinutes: positiveNumber(env.LOGIN_LOCKOUT_MINUTES, 15, 'LOGIN_LOCKOUT_MINUTES'),
    },
    loginRateLimits: DEFAULT_LOGIN_RATE_LIMITS,
    mfa: {
      // Required: C-032 makes MFA mandatory for administrators and finance staff.
      encryptionKey: parseMfaKey(env.MFA_ENCRYPTION_KEY ?? ''),
      issuer: env.MFA_ISSUER?.trim() || 'HMS',
    },
  };
}
