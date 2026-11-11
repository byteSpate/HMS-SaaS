import { describe, expect, it } from 'vitest';
import { ApiError, wasRefused } from './errors';

// SP-08: which failed commands get a new Idempotency-Key (T-SCH-02 review fix, T-BIL-01).
describe('wasRefused', () => {
  it('treats only a 4xx answer as a refusal; a timeout or a server error may have committed', () => {
    expect(wasRefused(new ApiError('CAPACITY_FULL', 409))).toBe(true);
    expect(wasRefused(new ApiError('VALIDATION_FAILED', 422))).toBe(true);
    expect(wasRefused(new ApiError('NETWORK', 0))).toBe(false);
    expect(wasRefused(new ApiError('UNKNOWN', 504))).toBe(false);
    expect(wasRefused(new Error('boom'))).toBe(false);
  });
});
