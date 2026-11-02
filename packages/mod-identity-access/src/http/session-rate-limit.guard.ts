// Per-session API rate limit (T-PLT-07 part 2; NFR-SEC-005; D section 8.6 layer 7). A guard, not
// middleware, because the key needs the resolved session. Routes without a session, such as
// /health and login, are not counted here; login has its own limits (T-ACC-03).
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { DomainError, type Clock } from '@hms/domain-kernel';
import type { RateLimiter } from '@hms/platform';
import { CLOCK } from '../application/auth.config.js';
import type { AuthenticatedRequest } from './request-context.js';

export const SESSION_RATE_LIMITER = Symbol('SESSION_RATE_LIMITER');

@Injectable()
export class SessionRateLimitGuard implements CanActivate {
  constructor(
    @Inject(SESSION_RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth) return true;
    // The hash, never the token itself: rate limit keys are readable in Valkey.
    const key = Buffer.from(auth.tokenHash).toString('hex');
    const result = await this.limiter.consume(key, this.clock.now());
    if (result.allowed) return true;
    throw new DomainError('RATE_LIMITED', 'Too many requests', {
      retryAfterSeconds: result.retryAfterSeconds,
    });
  }
}
