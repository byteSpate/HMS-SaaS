// /api/v1/billing/payments (T-BIL-04; UC-BIL-01, UC-BIL-02; FR-BIL-002, FR-BIL-011, FR-BIL-027):
// the cashier (billing.payment.record, C-009) records a payment allocated to invoice lines of one
// patient, reads it and the payments of a session, and prints its receipt. Amounts and balances
// come from the server (FR-BIL-035); the client sends only what was paid for which line.
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
import { ApiCookieAuth, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  paymentListQuerySchema,
  paymentListSchema,
  paymentSchema,
  printReceiptRequestSchema,
  receiptPrintSchema,
  recordPaymentRequestSchema,
  type Payment,
  type PaymentList,
  type PaymentListQuery,
  type PrintReceiptRequest,
  type ReceiptPrint,
  type RecordPaymentRequest,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, Idempotent, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { PaymentService } from '../application/payment.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;

/** A malformed ID is NOT_FOUND, like a payment of another hospital. */
function paymentIdPipe(): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Payment not found'),
  });
}

@ApiTags('billing')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('billing/payments')
export class PaymentsController {
  constructor(@Inject(PaymentService) private readonly payments: PaymentService) {}

  @Post()
  @HttpCode(201)
  @Idempotent('billing.payment.record')
  @RequirePermission('billing.payment.record')
  @ApiEndpoint({
    summary: 'Record a payment',
    description:
      "In the cashier's open session (INVALID_TRANSITION with reason CASHIER_SESSION_NOT_OPEN " +
      "otherwise). The allocations name the lines paid, of one patient's open invoices (C-039), " +
      'and add up to the amount (VALIDATION_FAILED otherwise). A line is never paid more than it ' +
      'still owes (AMOUNT_EXCEEDS_BALANCE, C-038). A fully paid line becomes ELIGIBLE (C-040). ' +
      'Needs an Idempotency-Key: a repeat returns the same payment and receipt number.',
    body: recordPaymentRequestSchema,
    success: { status: 201, description: 'The payment', schema: paymentSchema },
    errors: [
      ...ACCESS_ERRORS,
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'INVALID_TRANSITION',
      'AMOUNT_EXCEEDS_BALANCE',
      'IDEMPOTENCY_KEY_REUSED',
    ],
    csrf: true,
  })
  record(
    @Body(new ZodBodyPipe(recordPaymentRequestSchema)) request: RecordPaymentRequest,
  ): Promise<Payment> {
    return this.payments.record(request);
  }

  @Get()
  @RequirePermission('billing.payment.record')
  @ApiQuery({ name: 'sessionId', format: 'uuid' })
  @ApiEndpoint({
    summary: "List a cashier session's payments",
    description: 'Newest first, each with its receipt details, for reprints.',
    success: { status: 200, description: 'The payments', schema: paymentListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  list(
    @Query(new ZodBodyPipe(paymentListQuerySchema)) query: PaymentListQuery,
  ): Promise<PaymentList> {
    return this.payments.list(query.sessionId);
  }

  @Get(':paymentId')
  @RequirePermission('billing.payment.record')
  @ApiParam({ name: 'paymentId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Read one payment',
    success: { status: 200, description: 'The payment', schema: paymentSchema },
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  get(@Param('paymentId', paymentIdPipe()) paymentId: string): Promise<Payment> {
    return this.payments.get(paymentId);
  }

  @Post(':paymentId/prints')
  @HttpCode(201)
  @Idempotent('billing.receipt.print')
  @RequirePermission('billing.payment.record')
  @ApiParam({ name: 'paymentId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Print a receipt',
    description:
      'Records the print with the next copy number and returns the receipt page in the chosen ' +
      'language. Copy 2 and later say "Copy n" (FR-BIL-027). A print never creates a payment.',
    body: printReceiptRequestSchema,
    success: { status: 201, description: 'The receipt page', schema: receiptPrintSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED', 'NOT_FOUND', 'IDEMPOTENCY_KEY_REUSED'],
    csrf: true,
  })
  print(
    @Param('paymentId', paymentIdPipe()) paymentId: string,
    @Body(new ZodBodyPipe(printReceiptRequestSchema)) request: PrintReceiptRequest,
  ): Promise<ReceiptPrint> {
    return this.payments.print(paymentId, request);
  }
}
