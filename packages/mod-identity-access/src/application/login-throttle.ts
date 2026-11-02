// Login rate limits per client IP and per account (T-ACC-03; NFR-SEC-005; AT-ACC-007). Checked
// before the password, so a refused attempt costs no argon2 work. The account key is the
// normalized username, also for unknown users, so the answer does not reveal which exist.
import { DomainError } from '@hms/domain-kernel';
import type { RateLimiter, RateLimiterFactory, RateLimitResult } from '@hms/platform';
import type { LoginRateLimits } from './auth.config.js';

export const LOGIN_THROTTLE = Symbol('LOGIN_THROTTLE');

export class LoginThrottle {
  constructor(
    private readonly perIp: RateLimiter,
    private readonly perAccount: RateLimiter,
  ) {}

  static from(factory: RateLimiterFactory, limits: LoginRateLimits): LoginThrottle {
    return new LoginThrottle(
      factory.limiter('login-ip', limits.perIp),
      factory.limiter('login-account', limits.perAccount),
    );
  }

  async assertAllowed(ipAddress: string | undefined, username: string, now: Date): Promise<void> {
    // The IP is checked first, so an attacker spraying many usernames from one address is
    // stopped without filling the per-account table.
    if (ipAddress) refuseIfLimited(await this.perIp.consume(`ip:${ipAddress}`, now));
    refuseIfLimited(await this.perAccount.consume(`account:${username}`, now));
  }
}

function refuseIfLimited(result: RateLimitResult): void {
  if (!result.allowed) {
    throw new DomainError('RATE_LIMITED', 'Too many login attempts', {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
