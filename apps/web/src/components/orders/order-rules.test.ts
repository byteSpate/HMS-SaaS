// Order screen rules (T-ORD-01; FR-ORD-004, FR-ORD-008).
import type { OrderableService, ServiceOrder } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { addPending, paymentStateOf, requestOf } from './order-rules';

const cbc: OrderableService = {
  serviceItemId: '0199e0b0-0000-7000-8000-000000001001',
  code: 'CBC',
  category: 'LAB',
  nameBn: null,
  nameEn: 'Complete blood count',
  directlyOrderable: true,
  reportHours: 6,
  unitPrice: '450.00',
  version: 1,
};

describe('order rules', () => {
  it('adds a service once and sends a blank note as null', () => {
    const list = addPending(addPending([], cbc), cbc);
    expect(list).toHaveLength(1);
    expect(requestOf([{ ...list[0]!, priority: 'URGENT', note: '  ' }])).toEqual({
      items: [{ serviceItemId: cbc.serviceItemId, priority: 'URGENT', clinicalNote: null }],
    });
  });

  it('reads the payment state from the invoice line', () => {
    const order = {
      payment: {
        amount: '450.00',
        paid: '0.00',
        eligibility: 'NOT_ELIGIBLE',
        lineStatus: 'ACTIVE',
      },
    } as ServiceOrder;
    expect(paymentStateOf(order)).toBe('UNPAID');
    expect(
      paymentStateOf({ ...order, payment: { ...order.payment, eligibility: 'ELIGIBLE' } }),
    ).toBe('PAID');
    expect(
      paymentStateOf({ ...order, payment: { ...order.payment, lineStatus: 'CANCELLED' } }),
    ).toBe('CANCELLED');
  });
});
