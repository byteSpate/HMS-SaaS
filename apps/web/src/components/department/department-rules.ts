// Department worklist rules (T-ORD-02; FR-LAB-004, FR-BIL-003, FR-ORD-004). Pure, so they are
// tested without rendering. The worklist is split by what staff can do: start a paid order, carry
// on with one in progress, or send the patient to the cashier for one still awaiting payment. The
// server checks payment again when an order is started; this split only decides the layout.
import type { DepartmentWorklistOrder } from '@hms/contracts';

export interface DepartmentLists {
  ready: DepartmentWorklistOrder[];
  inProgress: DepartmentWorklistOrder[];
  awaitingPayment: DepartmentWorklistOrder[];
}

export function splitWorklist(orders: readonly DepartmentWorklistOrder[]): DepartmentLists {
  const lists: DepartmentLists = { ready: [], inProgress: [], awaitingPayment: [] };
  for (const order of orders) {
    if (order.status === 'IN_PROGRESS') lists.inProgress.push(order);
    else if (order.status !== 'REQUESTED' || order.payment.lineStatus !== 'ACTIVE') continue;
    else if (order.payment.eligibility === 'ELIGIBLE') lists.ready.push(order);
    else lists.awaitingPayment.push(order);
  }
  return lists;
}
