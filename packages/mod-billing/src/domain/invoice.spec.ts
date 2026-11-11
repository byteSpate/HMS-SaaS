import { Money } from '@hms/domain-kernel';
import { describe, expect, it } from 'vitest';
import {
  deriveInvoiceStatus,
  invoiceTypeFor,
  lineCategoryFor,
  sameCharge,
  subtotalsOf,
} from './invoice.js';

// Invoice rules (T-BIL-02; FR-BIL-001, FR-BIL-006, FR-BIL-008, FR-BIL-030; C-008).
const m = (amount: string) => Money.parse(amount);

describe('invoice rules', () => {
  it('C-008: puts a consultation on the doctor-fee invoice and the rest on the service invoice', () => {
    expect(invoiceTypeFor('CONSULTATION')).toBe('DOCTOR_FEE');
    expect(invoiceTypeFor('LAB')).toBe('SERVICE');
    expect(invoiceTypeFor('MEDICINE')).toBe('SERVICE');
  });

  it('SRC-B03: files medicine apart from everything else', () => {
    expect(lineCategoryFor('MEDICINE')).toBe('MEDICINE');
    expect(lineCategoryFor('CONSULTATION')).toBe('NON_MEDICINE');
  });

  it('FR-BIL-008: derives the status from the total and what was paid', () => {
    expect(deriveInvoiceStatus({ total: m('500.00'), paid: m('0'), activeLines: 1 })).toBe(
      'ISSUED',
    );
    expect(deriveInvoiceStatus({ total: m('500.00'), paid: m('200.00'), activeLines: 1 })).toBe(
      'PARTIALLY_PAID',
    );
    expect(deriveInvoiceStatus({ total: m('500.00'), paid: m('500.00'), activeLines: 1 })).toBe(
      'PAID',
    );
    // A PAID service invoice that gets a new line owes again.
    expect(deriveInvoiceStatus({ total: m('800.00'), paid: m('500.00'), activeLines: 2 })).toBe(
      'PARTIALLY_PAID',
    );
    expect(deriveInvoiceStatus({ total: m('0'), paid: m('0'), activeLines: 0 })).toBe('CANCELLED');
  });

  it('FR-BIL-006: a repeated posting matches only with the same content', () => {
    const charge = {
      patientId: 'p1',
      visitId: 'v1',
      serviceItemId: 'i1',
      practitionerId: 'd1',
      quantity: 1,
    };
    expect(sameCharge(charge, { ...charge })).toBe(true);
    expect(sameCharge(charge, { ...charge, quantity: 2 })).toBe(false);
    expect(sameCharge(charge, { ...charge, practitionerId: null })).toBe(false);
  });

  it('FR-BIL-030: subtotals medicine and other lines independently, active lines only', () => {
    const subtotals = subtotalsOf([
      { category: 'NON_MEDICINE', amount: m('500.00'), status: 'ACTIVE' },
      { category: 'MEDICINE', amount: m('120.50'), status: 'ACTIVE' },
      { category: 'MEDICINE', amount: m('80.00'), status: 'CANCELLED' },
    ]);
    expect(subtotals.medicine.toDecimalString()).toBe('120.50');
    expect(subtotals.nonMedicine.toDecimalString()).toBe('500.00');
  });
});
