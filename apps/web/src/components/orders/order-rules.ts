// Order screen rules (T-ORD-01; FR-ORD-004, FR-ORD-008). Pure, so they are tested without
// rendering: the pending list before placing, and what to show of an order's payment.
import type { OrderPriority, OrderableService, ServiceOrder } from '@hms/contracts';

export interface PendingOrder {
  service: OrderableService;
  priority: OrderPriority;
  note: string;
}

/** FR-ORD-008: Enter adds the service; the same service twice in one go is one line. */
export function addPending(
  list: readonly PendingOrder[],
  service: OrderableService,
): PendingOrder[] {
  if (list.some((row) => row.service.serviceItemId === service.serviceItemId)) return [...list];
  return [...list, { service, priority: 'ROUTINE', note: '' }];
}

export function requestOf(list: readonly PendingOrder[]) {
  return {
    items: list.map((row) => ({
      serviceItemId: row.service.serviceItemId,
      priority: row.priority,
      clinicalNote: row.note.trim() === '' ? null : row.note.trim(),
    })),
  };
}

export type PaymentState = 'PAID' | 'UNPAID' | 'CANCELLED';

/** FR-ORD-004: payment is shown beside the order's own status, from its invoice line. */
export function paymentStateOf(order: ServiceOrder): PaymentState {
  if (order.payment.lineStatus !== 'ACTIVE') return 'CANCELLED';
  return order.payment.eligibility === 'ELIGIBLE' ? 'PAID' : 'UNPAID';
}
