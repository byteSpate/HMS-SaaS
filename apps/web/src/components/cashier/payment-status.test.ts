import { describe, expect, it } from 'vitest';
import { ApiError, CLIENT_ERROR_CODES } from '../../api/errors';
import { checkOf, isUncertain } from './payment-status';

// The uncertain payment outcome (T-BIL-05; FR-BIL-036; SP-08). IDs are synthetic.
const ID = (n: number) => `0199e0d0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const PAYMENT = {
  paymentId: ID(1),
  receiptNumber: 'RCPT-000001',
  patient: { patientId: ID(2), mrn: 'MRN-000123', nameEn: 'Salma Begum', nameBn: null },
  sessionId: ID(3),
  method: 'CASH',
  providerLabel: null,
  externalReference: null,
  amount: '500.00',
  receivedAt: '2026-11-12T04:00:00.000Z',
  cashier: { userId: ID(4), displayName: 'Nasima Khatun' },
  invoices: [],
  printCount: 0,
};

describe('uncertain payment outcome', () => {
  it('a refusal saved nothing; a lost answer or a 5xx may have saved it', () => {
    expect(isUncertain(new ApiError('AMOUNT_EXCEEDS_BALANCE', 409))).toBe(false);
    expect(isUncertain(new ApiError(CLIENT_ERROR_CODES.NETWORK, 0))).toBe(true);
    expect(isUncertain(new ApiError('SERVICE_UNAVAILABLE', 503))).toBe(true);
    expect(isUncertain(null)).toBe(false);
  });

  it('the check finds the payment, finds nothing, or cannot tell', () => {
    expect(checkOf(undefined, null)).toEqual({ kind: 'checking' });
    expect(
      checkOf(
        {
          idempotencyKey: ID(9),
          operation: 'billing.payment.record',
          status: 'COMPLETED',
          result: PAYMENT,
        },
        null,
      ),
    ).toMatchObject({ kind: 'saved', payment: { receiptNumber: 'RCPT-000001' } });
    expect(checkOf(undefined, new ApiError('NOT_FOUND', 404))).toEqual({ kind: 'notSaved' });
    expect(checkOf(undefined, new ApiError(CLIENT_ERROR_CODES.NETWORK, 0))).toEqual({
      kind: 'unknown',
    });
  });
});
