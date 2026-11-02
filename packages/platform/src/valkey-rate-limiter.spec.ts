import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryRateLimiter } from './rate-limiter.js';
import { createValkeyConnection } from './valkey.js';
import { FallbackRateLimiter, ValkeyRateLimiter } from './valkey-rate-limiter.js';

// Shared rate limits against Valkey (T-PLT-07 part 2; NFR-SEC-005; D section 8.6 layer 7).
const valkeyUrl = process.env.VALKEY_URL;
if (!valkeyUrl) throw new Error('VALKEY_URL is required');

const NOW = new Date();

describe('ValkeyRateLimiter', () => {
  let connection: Redis;

  beforeAll(async () => {
    connection = createValkeyConnection(valkeyUrl, 'worker');
    await connection.ping();
  });

  afterAll(async () => {
    await connection.quit();
  });

  it('shares one count between limiters, as between API processes', async () => {
    const key = randomUUID();
    const rule = { limit: 2, windowMs: 60_000 };
    const first = new ValkeyRateLimiter(connection, 'test', rule);
    const second = new ValkeyRateLimiter(connection, 'test', rule);
    await expect(first.consume(key, NOW)).resolves.toEqual({ allowed: true });
    await expect(second.consume(key, NOW)).resolves.toEqual({ allowed: true });
    const refused = await first.consume(key, NOW);
    expect(refused.allowed).toBe(false);
    expect(refused).toMatchObject({ retryAfterSeconds: expect.any(Number) });
  });

  it('starts again after the window', async () => {
    const key = randomUUID();
    const limiter = new ValkeyRateLimiter(connection, 'test', { limit: 1, windowMs: 100 });
    await limiter.consume(key, NOW);
    expect((await limiter.consume(key, NOW)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect((await limiter.consume(key, NOW)).allowed).toBe(true);
  });

  it('never leaves a key without an expiry', async () => {
    const key = randomUUID();
    await new ValkeyRateLimiter(connection, 'ttl', { limit: 5, windowMs: 60_000 }).consume(
      key,
      NOW,
    );
    await expect(connection.pttl(`rate:ttl:${key}`)).resolves.toBeGreaterThan(0);
  });
});

describe('FallbackRateLimiter', () => {
  const rule = { limit: 1, windowMs: 60_000 };
  const broken = { consume: () => Promise.reject(new Error('Valkey is down')) };

  it('keeps limiting per process when Valkey is down, and reports it once', async () => {
    const problems: string[] = [];
    const limiter = new FallbackRateLimiter(broken, new InMemoryRateLimiter(rule), (message) =>
      problems.push(message),
    );
    expect((await limiter.consume('a', NOW)).allowed).toBe(true);
    expect((await limiter.consume('a', NOW)).allowed).toBe(false);
    expect(problems).toHaveLength(1);
  });

  it('uses the shared store while it works', async () => {
    const shared = new InMemoryRateLimiter({ limit: 5, windowMs: 60_000 });
    const limiter = new FallbackRateLimiter(shared, new InMemoryRateLimiter(rule), () => undefined);
    await limiter.consume('a', NOW);
    expect((await limiter.consume('a', NOW)).allowed).toBe(true);
  });
});
