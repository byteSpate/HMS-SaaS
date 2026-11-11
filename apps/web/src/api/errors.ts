// One error type for everything that can go wrong calling the API, so screens map a stable
// `code` to a localized message instead of showing server text (ADR-017 item 1).
// Implements: T-UI-02.
import type { Problem } from '@hms/contracts';

/** Codes that are not API error codes: the request never produced an API answer. */
export const CLIENT_ERROR_CODES = {
  NETWORK: 'NETWORK',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  UNKNOWN: 'UNKNOWN',
} as const;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly problem: Problem | undefined;

  constructor(code: string, status: number, problem?: Problem) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.problem = problem;
  }
}

/**
 * The API answered and refused (4xx), so nothing was written and a new attempt needs a new
 * Idempotency-Key. A timeout, a lost connection or a 5xx from a proxy may come after the server
 * committed, so the retry keeps the key and the server replays the first answer (SP-08).
 */
export function wasRefused(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}
