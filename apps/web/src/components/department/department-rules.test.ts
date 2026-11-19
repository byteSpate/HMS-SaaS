// Department worklist rules (T-ORD-02; FR-LAB-004).
import type { DepartmentWorklistOrder } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import { splitWorklist } from './department-rules';

const order = (
  orderId: string,
  status: DepartmentWorklistOrder['status'],
  payment: Partial<DepartmentWorklistOrder['payment']> = {},
): DepartmentWorklistOrder =>
  ({
    orderId,
    status,
    payment: {
      amount: '450.00',
      paid: '0.00',
      due: '450.00',
      eligibility: 'NOT_ELIGIBLE',
      lineStatus: 'ACTIVE',
      ...payment,
    },
  }) as DepartmentWorklistOrder;

const ids = (list: DepartmentWorklistOrder[]) => list.map((row) => row.orderId);

describe('splitWorklist', () => {
  it('puts paid waiting orders under ready and unpaid ones under awaiting payment', () => {
    const lists = splitWorklist([
      order('unpaid', 'REQUESTED'),
      order('paid', 'REQUESTED', { paid: '450.00', due: '0.00', eligibility: 'ELIGIBLE' }),
      order('part', 'REQUESTED', { paid: '100.00', due: '350.00' }),
    ]);
    expect(ids(lists.ready)).toEqual(['paid']);
    expect(ids(lists.awaitingPayment)).toEqual(['unpaid', 'part']);
    expect(lists.inProgress).toEqual([]);
  });

  it('keeps started orders apart and drops anything with a cancelled line', () => {
    const lists = splitWorklist([
      order('started', 'IN_PROGRESS', { eligibility: 'ELIGIBLE' }),
      order('gone', 'REQUESTED', { lineStatus: 'CANCELLED' }),
    ]);
    expect(ids(lists.inProgress)).toEqual(['started']);
    expect(lists.ready).toEqual([]);
    expect(lists.awaitingPayment).toEqual([]);
  });
});
