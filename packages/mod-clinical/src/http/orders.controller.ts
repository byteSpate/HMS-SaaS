// Service order routes (T-ORD-01; FR-ORD-001..008; UC-CLI-01 step 3; C00 section 8):
// - GET and POST /consultations/{id}/orders: the consultation's doctor lists and places orders
//   for the visit (order.service.create). Placing carries an Idempotency-Key (SP-01).
// - GET /orders/services?q=: the doctor's picker, every active priced service.
// - GET /orders/direct-services?q=: reception's picker, only directly orderable services
//   (order.direct_diagnostic.create, FR-ORD-001).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  orderableServiceListSchema,
  orderableServiceQuerySchema,
  placeOrdersRequestSchema,
  serviceOrderListSchema,
  type OrderableServiceList,
  type OrderableServiceQuery,
  type PlaceOrdersRequest,
  type ServiceOrderList,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { OrderService } from '../application/order.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;
const PICKER = {
  status: 200,
  description: 'Matching services with their price in force',
  schema: orderableServiceListSchema,
} as const;

@ApiTags('clinical')
@ApiCookieAuth(SESSION_SECURITY)
@Controller()
export class OrdersController {
  constructor(@Inject(OrderService) private readonly orders: OrderService) {}

  @Get('orders/services')
  @RequirePermission('order.service.create')
  @ApiEndpoint({
    summary: "Find services to order (doctor's picker)",
    description: 'Active services priced by the price list in force, matching code or name.',
    success: PICKER,
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  services(
    @Query(new ZodBodyPipe(orderableServiceQuerySchema)) query: OrderableServiceQuery,
  ): Promise<OrderableServiceList> {
    return this.orders.searchServices(query.q, false);
  }

  @Get('orders/direct-services')
  @RequirePermission('order.direct_diagnostic.create')
  @ApiEndpoint({
    summary: "Find services to order directly (reception's picker)",
    description: 'Only the services reception may order without a doctor (FR-ORD-001).',
    success: PICKER,
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  directServices(
    @Query(new ZodBodyPipe(orderableServiceQuerySchema)) query: OrderableServiceQuery,
  ): Promise<OrderableServiceList> {
    return this.orders.searchServices(query.q, true);
  }

  @Get('consultations/:consultationId/orders')
  @RequirePermission('order.service.create')
  @ApiParam({ name: 'consultationId', format: 'uuid' })
  @ApiEndpoint({
    summary: "List the visit's orders",
    description: 'Every order of the visit with its fulfilment status and its payment state.',
    success: { status: 200, description: 'The orders', schema: serviceOrderListSchema },
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  list(
    @Param(
      'consultationId',
      new ParseUUIDPipe({
        exceptionFactory: () => new DomainError('NOT_FOUND', 'Consultation not found'),
      }),
    )
    consultationId: string,
  ): Promise<ServiceOrderList> {
    return this.orders.listForConsultation(consultationId);
  }

  @Post('consultations/:consultationId/orders')
  @HttpCode(201)
  @Idempotent('clinical.order.place')
  @RequirePermission('order.service.create')
  @ApiParam({ name: 'consultationId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Order services from the consultation',
    description:
      "Each item becomes one order and one line on the visit's service invoice, priced by the " +
      'price list in force. The doctor fee being paid does not make them eligible (FR-ORD-005).',
    body: placeOrdersRequestSchema,
    success: { status: 201, description: "The visit's orders", schema: serviceOrderListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED', 'NOT_FOUND', 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  place(
    @Param(
      'consultationId',
      new ParseUUIDPipe({
        exceptionFactory: () => new DomainError('NOT_FOUND', 'Consultation not found'),
      }),
    )
    consultationId: string,
    @Body(new ZodBodyPipe(placeOrdersRequestSchema)) request: PlaceOrdersRequest,
  ): Promise<ServiceOrderList> {
    return this.orders.placeForConsultation(consultationId, request);
  }
}
