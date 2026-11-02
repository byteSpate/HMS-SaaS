// Login rate limits per client IP and per account (T-ACC-03; NFR-SEC-005; AT-ACC-007). Checked
// before the password, so a refused attempt costs no argon2 work. The account key is the
// normalized username, also for unknown users, so the answer does not reveal which exist.
import { DomainError } from '@hms/domain-kernel';
import { InMemoryRateLimiter, type RateLimiter, type RateLimitResult } from '@hms/platform';
import type { LoginRateLimits } from './auth.config.js';

export const LOGIN_THROTTLE = Symbol('LOGIN_THROTTLE');

export class LoginThrottle {
  constructor(
    private readonly perIp: RateLimiter,
    private readonly perAccount: RateLimiter,
  ) {}

  /** Counts per API process, so it suits a single process only; Valkey replaces this in T-PLT-03. */
  static inMemory(limits: LoginRateLimits): LoginThrottle {
    return new LoginThrottle(
      new InMemoryRateLimiter(limits.perIp),
      new InMemoryRateLimiter(limits.perAccount),
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
