// Reading invoices (T-BIL-02, T-BIL-04; FR-BIL-001, FR-BIL-008, FR-BIL-030, FR-BIL-031,
// FR-BIL-035; C-008). A visit's or a patient's invoices with their lines (paid so far, balance,
// eligibility), totals, balance and medicine and non-medicine subtotals, all computed from the
// same posted lines and allocations (summary equals detail). The cashier queue lists patients
// with invoices issued today that still owe money. invoiceSummaryOf is exported for screens of
// other modules, such as check-in's "doctor fee due" (T-VIS-01).
import { Inject, Injectable } from '@nestjs/common';
import type {
  CashierQueue,
  Invoice,
  InvoiceList,
  InvoiceListQuery,
  InvoiceSummary,
} from '@hms/contracts';
import { withTenant, type PrismaClient, type TenantTx } from '@hms/database';
import { calendarDateIn, DomainError, instantAt, type Clock } from '@hms/domain-kernel';
import { findPatientRefs, findPractitionerChoices } from '@hms/mod-patients';
import { PRISMA, requestScope } from '@hms/platform';
import { subtotalsOf } from '../domain/invoice.js';
import {
  findInvoice,
  listInvoices,
  listOpenInvoicesSince,
  type StoredInvoice,
} from '../infrastructure/invoice.repository.js';
import { BILLING_CLOCK } from './context.js';

// C-024: one facility per hospital, every pilot hospital in Bangladesh (as check-in assumes).
const HOSPITAL_TIME_ZONE = 'Asia/Dhaka';

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
        allocatedAmount: line.allocated.toDecimalString(),
        balance: line.amount.minus(line.allocated).toDecimalString(),
        eligibility: line.eligibility as Invoice['lines'][number]['eligibility'],
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
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(BILLING_CLOCK) private readonly clock: Clock,
  ) {}

  list(query: InvoiceListQuery): Promise<InvoiceList> {
    const scope = requestScope();
    const filter = {
      ...(query.visitId ? { visitId: query.visitId } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      openOnly: query.open === 'true',
    };
    return withTenant(this.prisma, scope, async (tx) => ({
      invoices: await toInvoices(tx, await listInvoices(tx, filter)),
    }));
  }

  /** SCR-06: patients with invoices issued today (hospital date) that still owe, newest first. */
  queue(): Promise<CashierQueue> {
    const scope = requestScope();
    const today = calendarDateIn(this.clock.now(), HOSPITAL_TIME_ZONE);
    const since = instantAt(today, '00:00', HOSPITAL_TIME_ZONE);
    return withTenant(this.prisma, scope, async (tx) => {
      const invoices = await listOpenInvoicesSince(tx, since);
      const patients = await findPatientRefs(
        tx,
        invoices.map((invoice) => invoice.patientId),
      );
      const byPatient = new Map<string, InvoiceSummary[]>();
      for (const invoice of invoices) {
        byPatient.set(invoice.patientId, [
          ...(byPatient.get(invoice.patientId) ?? []),
          summaryOf(invoice),
        ]);
      }
      return {
        patients: [...byPatient].flatMap(([patientId, summaries]) => {
          const patient = patients.get(patientId);
          return patient ? [{ patient, invoices: summaries }] : [];
        }),
      };
    });
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
