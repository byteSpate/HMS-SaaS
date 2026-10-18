import { describe, expect, it } from 'vitest';
import {
  bindRequestIdentity,
  getRequestContext,
  resolveRequestId,
  runWithRequestContext,
} from './request-context.js';

// T-PLT-07: correlation ID rules and the AsyncLocalStorage request context.
describe('resolveRequestId', () => {
  it('keeps a short token of letters, digits and hyphens', () => {
    expect(resolveRequestId('01J9-abc')).toBe('01J9-abc');
  });

  it.each([undefined, '', 'has space', 'semi;colon', 'line\nbreak', 'x'.repeat(65), ['a']])(
    'replaces %j with a new UUID',
    (candidate) => {
      const id = resolveRequestId(candidate);
      expect(id).not.toBe(candidate);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});

describe('request context', () => {
  it('is empty outside a request, and binding there does nothing', () => {
    expect(getRequestContext()).toBeUndefined();
    expect(() =>
      bindRequestIdentity({ userId: 'u', tenantId: 't', membershipId: null }),
    ).not.toThrow();
  });

  it('carries the bound identity across awaits, skipping missing tenant and membership', async () => {
    await runWithRequestContext({ correlationId: 'c-1' }, async () => {
      bindRequestIdentity({ userId: 'u-1', tenantId: null, membershipId: null });
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(getRequestContext()).toEqual({ correlationId: 'c-1', userId: 'u-1' });
    });
  });

  it('keeps concurrent requests apart', async () => {
    // Later requests finish first, so the continuations interleave.
    const seen = await Promise.all(
      ['a', 'b', 'c'].map((id, index) =>
        runWithRequestContext({ correlationId: id }, async () => {
          await new Promise((resolve) => setTimeout(resolve, (3 - index) * 3));
          return getRequestContext()?.correlationId;
        }),
      ),
    );
    expect(seen).toEqual(['a', 'b', 'c']);
  });
});
