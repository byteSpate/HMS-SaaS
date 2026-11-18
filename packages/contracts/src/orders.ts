// Service order contracts (T-ORD-01, T-VIS-02, T-ORD-03; FR-ORD-001..008; UC-CLI-01 step 3;
// UC-ORD-01, UC-ORD-02). An order asks for one catalogue service for a visit, from the doctor's
// consultation or directly at reception. Its fulfilment status is its own (FR-ORD-004); whether
// it is paid comes from its invoice line in billing and is shown beside it, never stored here.
import { z } from 'zod';
import { moneyAmountSchema } from './price-lists.js';
import { orderableCategorySchema, orderableServiceSchema } from './services.js';

export const ORDER_SOURCES = ['CONSULTATION', 'RECEPTION_DIRECT'] as const;
export const orderSourceSchema = z.enum(ORDER_SOURCES);
export type OrderSource = z.infer<typeof orderSourceSchema>;

export const ORDER_PRIORITIES = ['ROUTINE', 'URGENT'] as const;
export const orderPrioritySchema = z.enum(ORDER_PRIORITIES);
export type OrderPriority = z.infer<typeof orderPrioritySchema>;

export const ORDER_STATUSES = ['REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const ORDER_ITEMS_MAX = 20;

export const orderItemRequestSchema = z.strictObject({
  serviceItemId: z.uuid(),
  /** FR-ORD-002: chosen by staff. */
  priority: orderPrioritySchema,
  clinicalNote: z.string().trim().min(1).max(500).nullable(),
});
export type OrderItemRequest = z.infer<typeof orderItemRequestSchema>;

/** FR-ORD-008: one or more services at once; each becomes its own order and invoice line. */
export const placeOrdersRequestSchema = z.strictObject({
  items: z.array(orderItemRequestSchema).min(1).max(ORDER_ITEMS_MAX),
});
export type PlaceOrdersRequest = z.infer<typeof placeOrdersRequestSchema>;

/** FR-ORD-004: the payment state of the order's invoice line, read from billing. */
export const orderPaymentSchema = z.strictObject({
  amount: moneyAmountSchema,
  paid: moneyAmountSchema,
  eligibility: z.enum(['ELIGIBLE', 'NOT_ELIGIBLE']),
  lineStatus: z.enum(['ACTIVE', 'CANCELLED', 'REVERSED']),
});
export type OrderPayment = z.infer<typeof orderPaymentSchema>;

export const serviceOrderSchema = z.strictObject({
  orderId: z.uuid(),
  visitId: z.uuid(),
  source: orderSourceSchema,
  /** The service as it was when ordered (FR-ORD-002). */
  service: z.strictObject({
    serviceItemId: z.uuid(),
    code: z.string(),
    category: orderableCategorySchema,
    nameBn: z.string().nullable(),
    nameEn: z.string().nullable(),
  }),
  /** FR-ORD-007: expected hours from the order to the report. */
  reportHours: z.number().int().nullable(),
  priority: orderPrioritySchema,
  clinicalNote: z.string().nullable(),
  status: orderStatusSchema,
  payment: orderPaymentSchema,
  requestedAt: z.iso.datetime(),
  /** The requesting user's display name. */
  requestedBy: z.string(),
  cancelReason: z.string().nullable(),
  version: z.number().int(),
});
export type ServiceOrder = z.infer<typeof serviceOrderSchema>;

export const serviceOrderListSchema = z.strictObject({ orders: z.array(serviceOrderSchema) });
export type ServiceOrderList = z.infer<typeof serviceOrderListSchema>;

/** An order picker's search (FR-ORD-008 type-ahead). */
export const orderableServiceQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(60),
});
export type OrderableServiceQuery = z.infer<typeof orderableServiceQuerySchema>;

export const orderableServiceListSchema = z.strictObject({
  services: z.array(orderableServiceSchema),
});
export type OrderableServiceList = z.infer<typeof orderableServiceListSchema>;

/** UC-ORD-02: the reason is mandatory; the order's version guards a race (SP-03). */
export const cancelOrderRequestSchema = z.strictObject({
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().min(1),
});
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;
