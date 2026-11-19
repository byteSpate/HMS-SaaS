// Reception's direct diagnostic visits and orders (T-VIS-02; UC-VIS-02; FR-VIS-001, FR-ORD-001):
// - POST /visits/diagnostic: a DIAGNOSTIC visit with directly orderable services, which needs
//   visit.create and order.direct_diagnostic.create (both), with an Idempotency-Key (SP-01).
// - GET /visits/orders?patientId=: the patient's orders in open visits, for reception.
import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  createDiagnosticVisitRequestSchema,
  diagnosticVisitSchema,
  patientOrdersQuerySchema,
  serviceOrderListSchema,
  type CreateDiagnosticVisitRequest,
  type DiagnosticVisit,
  type PatientOrdersQuery,
  type ServiceOrderList,
} from '@hms/contracts';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { DirectOrderService } from '../application/direct-order.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;

@ApiTags('clinical')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('visits')
export class DirectOrdersController {
  constructor(@Inject(DirectOrderService) private readonly direct: DirectOrderService) {}

  @Post('diagnostic')
  @HttpCode(201)
  @Idempotent('clinical.visit.diagnostic')
  @RequirePermission('visit.create', 'order.direct_diagnostic.create')
  @ApiEndpoint({
    summary: 'Open a diagnostic visit with direct orders',
    description:
      "UC-VIS-02: the visit and one order per item, each a line on the visit's service " +
      'invoice, in one transaction. Only directly orderable services: another is ' +
      'TEST_NOT_DIRECTLY_ORDERABLE on that item and nothing is kept (FR-ORD-001).',
    body: createDiagnosticVisitRequestSchema,
    success: {
      status: 201,
      description: 'The visit and its orders',
      schema: diagnosticVisitSchema,
    },
    errors: [
      ...ACCESS_ERRORS,
      'VALIDATION_FAILED',
      'TEST_NOT_DIRECTLY_ORDERABLE',
      'IDEMPOTENCY_KEY_REUSED',
    ],
    csrf: true,
  })
  createDiagnostic(
    @Body(new ZodBodyPipe(createDiagnosticVisitRequestSchema))
    request: CreateDiagnosticVisitRequest,
  ): Promise<DiagnosticVisit> {
    return this.direct.createDiagnosticVisit(request);
  }

  @Get('orders')
  @RequirePermission('order.direct_diagnostic.create')
  @ApiEndpoint({
    summary: "List a patient's orders in open visits",
    description: 'Diagnostic and consultation orders, newest visit first, with payment state.',
    success: { status: 200, description: 'The orders', schema: serviceOrderListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  ordersOfPatient(
    @Query(new ZodBodyPipe(patientOrdersQuerySchema)) query: PatientOrdersQuery,
  ): Promise<ServiceOrderList> {
    return this.direct.ordersOfPatient(query.patientId);
  }
}
