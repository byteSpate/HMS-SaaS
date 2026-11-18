// Catalog keys for orders (T-ORD-01), as literals so the unused-key check can see them.
import type { OrderPriority, OrderStatus } from '@hms/contracts';
import type { PaymentState } from './order-rules';

export const STATUS_KEYS = {
  REQUESTED: 'orders.statusREQUESTED',
  IN_PROGRESS: 'orders.statusIN_PROGRESS',
  COMPLETED: 'orders.statusCOMPLETED',
  CANCELLED: 'orders.statusCANCELLED',
} as const satisfies Record<OrderStatus, string>;

export const PRIORITY_KEYS = {
  ROUTINE: 'orders.priorityROUTINE',
  URGENT: 'orders.priorityURGENT',
} as const satisfies Record<OrderPriority, string>;

export const PAYMENT_KEYS = {
  PAID: 'orders.paymentPAID',
  UNPAID: 'orders.paymentUNPAID',
  CANCELLED: 'orders.paymentCANCELLED',
} as const satisfies Record<PaymentState, string>;
