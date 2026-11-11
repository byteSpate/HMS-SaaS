// /api/v1/billing/invoices (T-BIL-02; FR-BIL-001, FR-BIL-008, FR-BIL-030; C-008): staff with
// billing.invoice.issue (the cashier, C-042) read a visit's invoices or one invoice, with lines,
// totals, balance and subtotals computed by the server. Invoices are created by the charge
// interface (postCharge), never by a client, and a client never sends a price (FR-BIL-007).
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  invoiceListQuerySchema,
  invoiceListSchema,
  invoiceSchema,
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
  @ApiQuery({ name: 'visitId', format: 'uuid' })
  @ApiEndpoint({
    summary: "List a visit's invoices",
    description:
      'The doctor-fee invoice first, then the service invoice (C-008), each with its lines in ' +
      'posting order, total, paid, balance and medicine and non-medicine subtotals.',
    success: { status: 200, description: 'The invoices', schema: invoiceListSchema },
    errors: [...ACCESS_ERRORS, 'VALIDATION_FAILED'],
  })
  list(
    @Query(new ZodBodyPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ): Promise<InvoiceList> {
    return this.invoices.list(query);
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
