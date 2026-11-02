// Rate limits shared between API processes (T-PLT-07 part 2; NFR-SEC-005; D section 8.6 layer 7).
// The window lives in Valkey and uses Valkey's clock, so every process counts the same.
import type { Redis } from 'ioredis';
import {
  InMemoryRateLimiter,
  type RateLimiter,
  type RateLimitResult,
  type RateLimitRule,
} from './rate-limiter.js';
import { createValkeyConnection } from './valkey.js';

// One atomic step: the first hit of a window also sets its expiry, so a crash between two commands
// can never leave a key that counts forever.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }`;

export class ValkeyRateLimiter implements RateLimiter {
  constructor(
    private readonly connection: Redis,
    private readonly prefix: string,
    private readonly rule: RateLimitRule,
  ) {}

  async consume(key: string): Promise<RateLimitResult> {
    const [count, ttlMs] = (await this.connection.eval(
      CONSUME_SCRIPT,
      1,
      `rate:${this.prefix}:${key}`,
      this.rule.windowMs,
    )) as [number, number];
    if (count <= this.rule.limit) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.ceil(Math.max(ttlMs, 1) / 1000) };
  }
}

/**
 * Falls back to per-process counting while the shared store fails. A cache outage must not stop
 * care or billing, and limits still apply, only less exactly. Reports once per outage.
 */
export class FallbackRateLimiter implements RateLimiter {
  private degraded = false;

  constructor(
    private readonly shared: RateLimiter,
    private readonly local: RateLimiter,
    private readonly report: (message: string) => void,
  ) {}

  async consume(key: string, now: Date): Promise<RateLimitResult> {
    try {
      const result = await this.shared.consume(key, now);
      this.degraded = false;
      return result;
    } catch (error) {
      if (!this.degraded) {
        this.degraded = true;
        this.report(`Rate limits fell back to this process: ${(error as Error).message}`);
      }
      return this.local.consume(key, now);
    }
  }
}

export interface RateLimiterFactory {
  limiter(prefix: string, rule: RateLimitRule): RateLimiter;
  close(): Promise<void>;
}

/** Without a Valkey URL (tests, a single process) limits are simply per process. */
export function createRateLimiterFactory(
  valkeyUrl: string | undefined,
  report: (message: string) => void,
): RateLimiterFactory {
  if (!valkeyUrl) {
    return {
      limiter: (_prefix, rule) => new InMemoryRateLimiter(rule),
      close: () => Promise.resolve(),
    };
  }
  const connection = createValkeyConnection(valkeyUrl, 'producer');
  return {
    limiter: (prefix, rule) =>
      new FallbackRateLimiter(
        new ValkeyRateLimiter(connection, prefix, rule),
        new InMemoryRateLimiter(rule),
        report,
      ),
    close: async () => {
      connection.disconnect();
    },
  };
}
