// What the cashier desk shows after a payment's answer was lost (T-BIL-05; FR-BIL-036; SP-08;
// F section 5 "Uncertain outcome"). Pure, so it is tested without rendering. A refusal (4xx)
// saved nothing and is shown as an error. Anything else, a timeout, a lost connection or a 5xx
// from a proxy, may have come after the server committed: the desk then asks by the payment's
// Idempotency-Key and never offers "Pay again" while it does not know.
import { paymentSchema, type OperationOutcome, type Payment } from '@hms/contracts';
import { ApiError, wasRefused } from '../../api/errors';

export type PaymentCheck =
  | { kind: 'checking' }
  | { kind: 'saved'; payment: Payment }
  /** Nothing took effect; sending it again with the same key is safe. */
  | { kind: 'notSaved' }
  /** The check itself failed; the desk cannot tell yet. */
  | { kind: 'unknown' };

/** True when a failed payment may still have been saved. */
export function isUncertain(error: unknown): boolean {
  return error !== null && error !== undefined && !wasRefused(error);
}

/** The desk's state from the status check's answer or failure. */
export function checkOf(outcome: OperationOutcome | undefined, error: unknown): PaymentCheck {
  if (outcome) {
    const payment = paymentSchema.safeParse(outcome.result);
    return payment.success ? { kind: 'saved', payment: payment.data } : { kind: 'unknown' };
  }
  if (error instanceof ApiError && error.code === 'NOT_FOUND') return { kind: 'notSaved' };
  return error ? { kind: 'unknown' } : { kind: 'checking' };
}
