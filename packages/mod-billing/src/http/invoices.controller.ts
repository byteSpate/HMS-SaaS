// /api/v1/billing/invoices (T-BIL-02, T-BIL-04; FR-BIL-001, FR-BIL-008, FR-BIL-030; C-008):
// staff with billing.invoice.issue (the cashier, C-042) read a visit's or a patient's invoices or
// one invoice, with lines, totals, balance and subtotals computed by the server; the cashier
// (billing.payment.record) reads today's queue. Invoices are created by the charge interface
// (postCharge), never by a client, and a client never sends a price (FR-BIL-007).
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  cashierQueueSchema,
  invoiceListQuerySchema,
  invoiceListSchema,
  invoiceSchema,
  type CashierQueue,
  type Invoice,
  type InvoiceList,
  type InvoiceListQuery,
} from '@hms/contracts';
import { DomainError } from '@hms/domain-kernel';
import { RequirePermission } from '@hms/mod-identity-access';
import { ApiEndpoint, SESSION_SECURITY, ZodBodyPipe } from '@hms/platform';
import { InvoiceService } from '../application/invoice.service.js';

const ACCESS_ERRORS = ['UNAUTHENTICATED', 'PERMISSION_DENIED', 'ENTITLEMENT_MISSING'] as const;

/** A malformed ID is NOT_FOUND, like an invoice of another hospital. */
function invoiceIdPipe(): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () => new DomainError('NOT_FOUND', 'Invoice not found'),
  });
}

@ApiTags('billing')
@ApiCookieAuth(SESSION_SECURITY)
@Controller('billing/invoices')
export class InvoicesController {
  constructor(@Inject(InvoiceService) private readonly invoices: InvoiceService) {}

  @Get()
  @RequirePermission('billing.invoice.issue')
  @ApiQuery({ name: 'visitId', format: 'uuid', required: false })
  @ApiQuery({ name: 'patientId', format: 'uuid', required: false })
  @ApiQuery({ name: 'open', enum: ['true', 'false'], required: false })
  @ApiEndpoint({
    summary: "List a visit's or a patient's invoices",
    description:
      'Give a visitId or a patientId. Doctor-fee invoices first, then service invoices (C-008), ' +
      'each with its lines in posting order (paid so far, balance, eligibility), total, paid, ' +
      'balance and medicine and non-medicine subtotals. open=true keeps those still owing.',
    success: { status: 200, description: 'The invoices', schema: invoiceListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  list(
    @Query(new ZodBodyPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ): Promise<InvoiceList> {
    return this.invoices.list(query);
  }

  // Before ':invoiceId', so "queue" is not read as an invoice ID.
  @Get('queue')
  @RequirePermission('billing.payment.record')
  @ApiEndpoint({
    summary: "Today's cashier queue",
    description:
      'Patients with invoices issued today (hospital date) that still owe money, newest first, ' +
      'each with the summaries of those invoices (SCR-06).',
    success: { status: 200, description: 'The queue', schema: cashierQueueSchema },
    errors: [...ACCESS_ERRORS],
  })
  queue(): Promise<CashierQueue> {
    return this.invoices.queue();
  }

  @Get(':invoiceId')
  @RequirePermission('billing.invoice.issue')
  @ApiParam({ name: 'invoiceId', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Read one invoice',
    success: { status: 200, description: 'The invoice', schema: invoiceSchema },
    errors: [...ACCESS_ERRORS, 'NOT_FOUND'],
  })
  get(@Param('invoiceId', invoiceIdPipe()) invoiceId: string): Promise<Invoice> {
    return this.invoices.get(invoiceId);
  }
}
