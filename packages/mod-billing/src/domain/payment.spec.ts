import { DomainError, Money } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import { planPayment, type InvoiceState, type LineState } from './payment.js';

// Payment rules (T-BIL-04; FR-BIL-012, FR-BIL-019, FR-BIL-034; C-038, C-039, C-040; AT-BIL-004,
// AT-BIL-006, AT-BIL-014). IDs are synthetic. Doctor fee D = 500.00; services S = CBC 300.00 and
// X-ray 700.00, as in C04 section 8.
const PATIENT = '0199e0a0-0000-7000-8000-000000000001';
const OTHER = '0199e0a0-0000-7000-8000-000000000002';
const m = (amount: string) => Money.parse(amount);

const line = (lineId: string, invoiceId: string, net: string, allocated = '0.00'): LineState => ({
  lineId,
  invoiceId,
  status: 'ACTIVE',
  net: m(net),
  allocated: m(allocated),
});
const LINES = new Map<string, LineState>([
  ['fee', line('fee', 'D', '500.00')],
  ['cbc', line('cbc', 'S', '300.00')],
  ['xray', line('xray', 'S', '700.00')],
]);
const invoice = (invoiceId: string, total: string, paid = '0.00'): InvoiceState => ({
  invoiceId,
  patientId: PATIENT,
  status: 'ISSUED',
  total: m(total),
  paid: m(paid),
  activeLines: invoiceId === 'D' ? 1 : 2,
});
const INVOICES = new Map<string, InvoiceState>([
  ['D', invoice('D', '500.00')],
  ['S', invoice('S', '1000.00')],
]);

const request = (amount: string, allocations: [string, string][], patientId = PATIENT) => ({
  patientId,
  amount: m(amount),
  allocations: allocations.map(([lineId, value]) => ({ lineId, amount: m(value) })),
});

const codeOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error instanceof DomainError ? error.code : 'OTHER';
  }
  return 'NONE';
};

describe('payment rules', () => {
  it('pays the doctor fee in full: the line is eligible and D is PAID, S untouched', () => {
    const plan = planPayment(request('500.00', [['fee', '500.00']]), LINES, INVOICES);
    expect(plan.lines).toEqual([
      { lineId: 'fee', allocatedAfter: m('500.00'), eligibility: 'ELIGIBLE' },
    ]);
    expect(plan.invoices).toEqual([
      {
        invoiceId: 'D',
        paidNow: m('500.00'),
        paidAfter: m('500.00'),
        balanceAfter: m('0.00'),
        status: 'PAID',
      },
    ]);
    expect(plan.allocations).toEqual([
      { lineId: 'fee', invoiceId: 'D', amount: m('500.00'), invoiceBalanceAfter: m('0.00') },
    ]);
  });

  it('C-039: one payment pays several invoices of the patient', () => {
    const plan = planPayment(
      request('800.00', [
        ['fee', '500.00'],
        ['cbc', '300.00'],
      ]),
      LINES,
      INVOICES,
    );
    expect(plan.invoices.map((row) => [row.invoiceId, row.status, row.balanceAfter])).toEqual([
      ['D', 'PAID', m('0.00')],
      ['S', 'PARTIALLY_PAID', m('700.00')],
    ]);
  });

  it('AT-BIL-006: a partial payment of a line leaves it NOT_ELIGIBLE', () => {
    const plan = planPayment(request('200.00', [['fee', '200.00']]), LINES, INVOICES);
    expect(plan.lines[0]?.eligibility).toBe('NOT_ELIGIBLE');
    expect(plan.invoices[0]?.status).toBe('PARTIALLY_PAID');
  });

  it('AT-BIL-004: the lines must add up to the amount', () => {
    expect(codeOf(() => planPayment(request('400.00', [['fee', '500.00']]), LINES, INVOICES))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('AT-BIL-014, C-038: no line is paid more than it still owes', () => {
    const paidLines = new Map(LINES);
    paidLines.set('xray', line('xray', 'S', '700.00', '700.00'));
    expect(
      codeOf(() => planPayment(request('700.00', [['xray', '700.00']]), paidLines, INVOICES)),
    ).toBe('AMOUNT_EXCEEDS_BALANCE');
    expect(codeOf(() => planPayment(request('600.00', [['fee', '600.00']]), LINES, INVOICES))).toBe(
      'AMOUNT_EXCEEDS_BALANCE',
    );
  });

  it('refuses a line of another patient, a missing line and a cancelled invoice', () => {
    const others = new Map(INVOICES);
    others.set('D', { ...invoice('D', '500.00'), patientId: OTHER });
    expect(codeOf(() => planPayment(request('500.00', [['fee', '500.00']]), LINES, others))).toBe(
      'VALIDATION_FAILED',
    );
    expect(
      codeOf(() => planPayment(request('10.00', [['nothing', '10.00']]), LINES, INVOICES)),
    ).toBe('NOT_FOUND');
    const cancelled = new Map(INVOICES);
    cancelled.set('D', { ...invoice('D', '500.00'), status: 'CANCELLED' });
    expect(
      codeOf(() => planPayment(request('500.00', [['fee', '500.00']]), LINES, cancelled)),
    ).toBe('INVALID_TRANSITION');
  });
});
