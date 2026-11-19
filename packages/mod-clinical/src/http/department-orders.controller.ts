// Department routes for service orders (T-ORD-02; FR-ORD-004, FR-BIL-003, FR-LAB-004; UC-BIL-02
// "Gate"; C-100 proposes the permission):
// - GET /orders/worklist?category=: today's waiting and in-progress orders with the patient and
//   the payment state, so the screen shows "ready" and "awaiting payment" (order.service.start).
// - POST /orders/{id}/start: REQUESTED -> IN_PROGRESS, only when the invoice line is fully paid;
//   otherwise PAYMENT_NOT_ELIGIBLE with the amount due (order.service.start, Idempotency-Key).
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
  departmentWorklistQuerySchema,
  departmentWorklistSchema,
  serviceOrderSchema,
  startOrderRequestSchema,
  type DepartmentWorklist,
  type DepartmentWorklistQuery,
  type ServiceOrder,
  type StartOrderRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { DepartmentWorklistService } from '../application/department-worklist.service.js';
import { OrderStartService } from '../application/order-start.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;

@ApiTags('clinical')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('orders')
export class DepartmentOrdersController {
  constructor(
    @Inject(DepartmentWorklistService) private readonly worklist: DepartmentWorklistService,
    @Inject(OrderStartService) private readonly starter: OrderStartService,
  ) {}

  @Get('worklist')
  @RequirePermission('order.service.start')
  @ApiEndpoint({
    summary: 'Department worklist',
    description:
      "Today's orders that are waiting or in progress, urgent first, with the patient and the " +
      'payment state of each invoice line. ELIGIBLE orders may start; the others await payment ' +
      '(FR-LAB-004). Filter by category, or leave it out for every category.',
    success: { status: 200, description: 'The worklist', schema: departmentWorklistSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  list(
    @Query(new ZodBodyPipe(departmentWorklistQuerySchema)) query: DepartmentWorklistQuery,
  ): Promise<DepartmentWorklist> {
    return this.worklist.list(query);
  }

  @Post(':orderId/start')
  @HttpCode(200)
  @Idempotent('clinical.order.start')
  @RequirePermission('order.service.start')
  @ApiParam({ name: 'orderId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Start an order (payment gate)',
    description:
      'Moves a REQUESTED order to IN_PROGRESS. Billing checks on the server that its invoice ' +
      'line is fully paid (FR-BIL-003, C-040); otherwise PAYMENT_NOT_ELIGIBLE lists each unpaid ' +
      'line with the invoice number and the amount due, and nothing changes.',
    body: startOrderRequestSchema,
    success: { status: 200, description: 'The started order', schema: serviceOrderSchema },
    errors: [
      ...ACCESS_ERRORS,
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'STALE_RECORD',
      'INVALID_TRANSITION',
      'PAYMENT_NOT_ELIGIBLE',
      'IDEMPOTENCY_KEY_REUSED',
    ],
    csrf: true,
  })
  start(
    @Param(
      'orderId',
      new ParseUUIDPipe({
        exceptionFactory: () => new DomainError('NOT_FOUND', 'Order not found'),
      }),
    )
    orderId: string,
    @Body(new ZodBodyPipe(startOrderRequestSchema)) request: StartOrderRequest,
  ): Promise<ServiceOrder> {
    return this.starter.start(orderId, request);
  }
}
