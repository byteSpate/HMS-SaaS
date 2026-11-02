// Fixed-window rate limiting (NFR-SEC-005). T-ACC-03 uses it for login per IP and per account.
// The in-memory store counts per API process, so it suits a single process only; a Valkey store
// with the same interface follows with T-PLT-03 (D section 8.6 layer 7).

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Counts one attempt for the key and says whether it is still within the limit. */
  consume(key: string, now: Date): Promise<RateLimitResult>;
}

interface Window {
  startedAt: number;
  count: number;
}

const DEFAULT_MAX_KEYS = 50_000;

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly rule: RateLimitRule,
    // Bounds memory when an attacker sends many distinct keys (usernames, spoofed IPs).
    private readonly maxKeys = DEFAULT_MAX_KEYS,
  ) {}

  get size(): number {
    return this.windows.size;
  }

  consume(key: string, now: Date): Promise<RateLimitResult> {
    const at = now.getTime();
    const current = this.windows.get(key);
    if (!current || at - current.startedAt >= this.rule.windowMs) {
      this.windows.delete(key);
      this.makeRoom(at);
      this.windows.set(key, { startedAt: at, count: 1 });
      return Promise.resolve({ allowed: true });
    }
    current.count += 1;
    if (current.count <= this.rule.limit) return Promise.resolve({ allowed: true });
    const retryAfterMs = current.startedAt + this.rule.windowMs - at;
    return Promise.resolve({ allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) });
  }

  private makeRoom(at: number): void {
    if (this.windows.size < this.maxKeys) return;
    for (const [key, window] of this.windows) {
      if (at - window.startedAt >= this.rule.windowMs) this.windows.delete(key);
    }
    // Still full: drop the oldest windows (Map keeps insertion order).
    for (const key of this.windows.keys()) {
      if (this.windows.size < this.maxKeys) break;
      this.windows.delete(key);
    }
  }
}
