// Reading invoices (T-BIL-02; FR-BIL-001, FR-BIL-008, FR-BIL-030, FR-BIL-031; C-008). A visit's
// invoices with their lines, totals, balance and medicine and non-medicine subtotals, all computed
// from the same posted lines (summary equals detail). invoiceSummaryOf is exported for screens of
// other modules, such as check-in's "doctor fee due" (T-VIS-01).
import { Inject, Injectable } from '@nestjs/common';
import type { Invoice, InvoiceList, InvoiceListQuery, InvoiceSummary } from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { findPractitionerChoices } from '@hms/mod-patients';
import { PRISMA, requestScope } from '@hms/platform';
import { subtotalsOf } from '../domain/invoice.js';
import {
  findInvoice,
  listVisitInvoices,
  type StoredInvoice,
} from '../infrastructure/invoice.repository.js';

function summaryOf(invoice: StoredInvoice): InvoiceSummary {
  return {
    invoiceId: invoice.invoiceId,
    number: invoice.number,
    type: invoice.type,
    status: invoice.status,
    total: invoice.total.toDecimalString(),
    paid: invoice.paid.toDecimalString(),
    balance: invoice.total.minus(invoice.paid).toDecimalString(),
  };
}

async function toInvoices(tx: TenantTx, stored: StoredInvoice[]): Promise<Invoice[]> {
  const practitionerIds = stored.flatMap((invoice) =>
    invoice.lines.flatMap((line) => (line.practitionerId ? [line.practitionerId] : [])),
  );
  const choices = await findPractitionerChoices(tx, practitionerIds);
  return stored.map((invoice) => {
    const subtotals = subtotalsOf(invoice.lines);
    return {
      ...summaryOf(invoice),
      patientId: invoice.patientId,
      visitId: invoice.visitId,
      currency: invoice.currency,
      subtotals: {
        medicine: subtotals.medicine.toDecimalString(),
        nonMedicine: subtotals.nonMedicine.toDecimalString(),
      },
      issuedAt: invoice.issuedAt.toISOString(),
      version: invoice.version,
      lines: invoice.lines.map((line) => ({
        lineId: line.lineId,
        lineNo: line.lineNo,
        itemCode: line.itemCode,
        itemNameEn: line.itemNameEn,
        itemNameBn: line.itemNameBn,
        practitioner: line.practitionerId ? (choices.get(line.practitionerId) ?? null) : null,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toDecimalString(),
        amount: line.amount.toDecimalString(),
        category: line.category,
        status: line.status as Invoice['lines'][number]['status'],
      })),
    };
  });
}

/** An invoice's number, type, status and amounts, inside the caller's transaction. */
export async function invoiceSummaryOf(tx: TenantTx, invoiceId: string): Promise<InvoiceSummary> {
  const invoice = await findInvoice(tx, invoiceId);
  if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found');
  return summaryOf(invoice);
}

@Injectable()
export class InvoiceService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  list(query: InvoiceListQuery): Promise<InvoiceList> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => ({
      invoices: await toInvoices(tx, await listVisitInvoices(tx, query.visitId)),
    }));
  }

  get(invoiceId: string): Promise<Invoice> {
    const scope = requestScope();
    return withTenant(this.prisma, scope, async (tx) => {
      const stored = await findInvoice(tx, invoiceId);
      if (!stored) throw new DomainError('NOT_FOUND', 'Invoice not found');
      const [invoice] = await toInvoices(tx, [stored]);
      if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found');
      return invoice;
    });
  }
}
