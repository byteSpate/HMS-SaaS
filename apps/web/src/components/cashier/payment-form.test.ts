import type { Invoice } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { allocationsOf, lineProblemOf, requestOf, selectionOf } from './payment-form';

// The cashier desk's payment rules (T-BIL-04; FR-BIL-012; C-038, C-039). IDs are synthetic.
const ID = (n: number) => `0199e0d0-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** [lineId, amount, paid so far, balance] */
type LineRow = [string, string, string, string];

function invoiceOf(invoiceId: string, type: Invoice['type'], lines: LineRow[]): Invoice {
  return {
    invoiceId,
    number: `INV-${invoiceId.slice(-3)}`,
    type,
    status: 'ISSUED',
    total: '0.00',
    paid: '0.00',
    balance: '0.00',
    patientId: ID(1),
    visitId: ID(2),
    currency: 'BDT',
    subtotals: { medicine: '0.00', nonMedicine: '0.00' },
    issuedAt: '2026-11-12T04:00:00.000Z',
    version: 1,
    lines: lines.map(([lineId, amount, allocatedAmount, balance], index) => ({
      lineId,
      lineNo: index + 1,
      itemCode: 'DOCTOR_FEE_NEW',
      itemNameEn: null,
      itemNameBn: null,
      practitioner: null,
      quantity: 1,
      unitPrice: amount,
      amount,
      category: 'NON_MEDICINE',
      status: 'ACTIVE',
      allocatedAmount,
      balance,
      eligibility: balance === '0.00' ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
    })),
  };
}

const FEE = ID(10);
const CBC = ID(11);
const XRAY = ID(12);
const PAID = ID(13);
const INVOICES = [
  invoiceOf(ID(100), 'DOCTOR_FEE', [[FEE, '500.00', '0.00', '500.00']]),
  invoiceOf(ID(101), 'SERVICE', [
    [CBC, '300.00', '0.00', '300.00'],
    [XRAY, '700.00', '0.00', '700.00'],
    [PAID, '200.00', '200.00', '0.00'],
  ]),
];

describe('cashier payment form', () => {
  it('FR-BIL-012: pre-selects every unpaid line for its whole balance', () => {
    expect(selectionOf(INVOICES)).toEqual({
      [FEE]: { selected: true, amountText: '500.00' },
      [CBC]: { selected: true, amountText: '300.00' },
      [XRAY]: { selected: true, amountText: '700.00' },
    });
  });

  it('C-039: one payment pays the selected lines of both invoices', () => {
    const selection = selectionOf(INVOICES);
    selection[XRAY] = { selected: false, amountText: '700.00' };
    const allocations = allocationsOf(INVOICES, selection);
    expect(allocations).toEqual([
      { lineId: FEE, amount: '500.00' },
      { lineId: CBC, amount: '300.00' },
    ]);
    expect(
      requestOf(ID(1), allocations ?? [], {
        method: 'MOBILE',
        providerLabel: ' bKash ',
        externalReference: '',
      }),
    ).toEqual({
      patientId: ID(1),
      method: 'MOBILE',
      amount: '800.00',
      allocations,
      providerLabel: 'bKash',
    });
  });

  it('a partial amount is for its line; more than the line owes is stopped (C-038)', () => {
    expect(lineProblemOf({ selected: true, amountText: '200' }, '500.00')).toBeNull();
    expect(lineProblemOf({ selected: true, amountText: '600' }, '500.00')).toBe('overBalance');
    expect(lineProblemOf({ selected: true, amountText: 'abc' }, '500.00')).toBe('notAmount');
    expect(lineProblemOf({ selected: true, amountText: '0' }, '500.00')).toBe('notAmount');
    expect(lineProblemOf({ selected: false, amountText: '600' }, '500.00')).toBeNull();
    const selection = selectionOf(INVOICES);
    selection[FEE] = { selected: true, amountText: '600' };
    expect(allocationsOf(INVOICES, selection)).toBeNull();
  });

  it('sends nothing when no line is selected', () => {
    const none = Object.fromEntries(
      Object.keys(selectionOf(INVOICES)).map((lineId) => [
        lineId,
        { selected: false, amountText: '' },
      ]),
    );
    expect(allocationsOf(INVOICES, none)).toBeNull();
  });
});
