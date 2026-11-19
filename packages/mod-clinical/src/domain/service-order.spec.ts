// Service order rules (T-ORD-03; FR-ORD-006 interim; UC-ORD-02 D1).
import { DomainError } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { assertCancellable } from './service-order.js';

const codeOf = (action: () => void): string | undefined => {
  try {
    action();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'not a DomainError';
  }
  return undefined;
};

describe('assertCancellable', () => {
  it('allows a REQUESTED order at the version the screen showed', () => {
    expect(codeOf(() => assertCancellable({ status: 'REQUESTED', version: 1 }, 1))).toBeUndefined();
  });

  it('refuses a stale version, a cancelled order and work already started', () => {
    expect(codeOf(() => assertCancellable({ status: 'REQUESTED', version: 2 }, 1))).toBe(
      'STALE_RECORD',
    );
    expect(codeOf(() => assertCancellable({ status: 'CANCELLED', version: 1 }, 1))).toBe(
      'INVALID_TRANSITION',
    );
    expect(codeOf(() => assertCancellable({ status: 'IN_PROGRESS', version: 1 }, 1))).toBe(
      'FEATURE_NOT_AVAILABLE',
    );
    expect(codeOf(() => assertCancellable({ status: 'COMPLETED', version: 1 }, 1))).toBe(
      'FEATURE_NOT_AVAILABLE',
    );
  });
});
