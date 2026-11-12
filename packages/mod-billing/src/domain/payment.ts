// Payment rules (T-BIL-04; FR-BIL-011, FR-BIL-012, FR-BIL-019, FR-BIL-034; C-038, C-039, C-040;
// P-020, ADR-016). Pure: from the request and the locked lines and invoices, the plan of what the
// payment writes, or the reason it is refused. Amounts are Money throughout (ADR-007).
import { DomainError, fieldError, Money } from '@hms/domain-kernel';
import { deriveInvoiceStatus, type InvoiceStatus } from './invoice.js';

export type Eligibility = 'ELIGIBLE' | 'NOT_ELIGIBLE';

export interface LineState {
  lineId: string;
  invoiceId: string;
  status: string;
  net: Money;
  allocated: Money;
}

export interface InvoiceState {
  invoiceId: string;
  patientId: string;
  status: string;
  total: Money;
  paid: Money;
  activeLines: number;
}

export interface PaymentRequest {
  patientId: string;
  amount: Money;
  allocations: { lineId: string; amount: Money }[];
}

export interface PaymentPlan {
  lines: { lineId: string; allocatedAfter: Money; eligibility: Eligibility }[];
  invoices: {
    invoiceId: string;
    paidNow: Money;
    paidAfter: Money;
    balanceAfter: Money;
    status: InvoiceStatus;
  }[];
  allocations: { lineId: string; invoiceId: string; amount: Money; invoiceBalanceAfter: Money }[];
}

/** C-040 FULL_PAYMENT: a line is eligible for its service only when it is fully paid. */
export function eligibilityOf(net: Money, allocated: Money): Eligibility {
  return allocated.compare(net) >= 0 ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
}

function checkLine(
  line: LineState | undefined,
  invoice: InvoiceState | undefined,
  patientId: string,
): asserts line is LineState {
  // RLS hides another hospital's lines, so they read as missing.
  if (!line || !invoice) throw new DomainError('NOT_FOUND', 'Invoice line not found');
  // C-039: one payment covers several invoices, but all of one patient.
  if (invoice.patientId !== patientId) {
    throw fieldError('allocations', 'Every line must be of this patient');
  }
  if (invoice.status === 'CANCELLED' || line.status !== 'ACTIVE') {
    throw new DomainError('INVALID_TRANSITION', 'This invoice line cannot be paid', {
      lineId: line.lineId,
    });
  }
}

/**
 * The payment's plan, checked against the lines as they are under the invoice locks:
 * - the allocations add up to the amount (FR-BIL-012, AT-BIL-004);
 * - every line is active, of an invoice that is not cancelled, of this patient (C-039);
 * - no line gets more than it still owes (C-038, FR-BIL-019, FR-BIL-034).
 */
export function planPayment(
  request: PaymentRequest,
  lines: ReadonlyMap<string, LineState>,
  invoices: ReadonlyMap<string, InvoiceState>,
): PaymentPlan {
  const sum = request.allocations.reduce((total, row) => total.plus(row.amount), Money.zero());
  if (!sum.equals(request.amount)) {
    throw fieldError('amount', 'The amount must equal the sum of the lines paid');
  }

  const planned = request.allocations.map((allocation) => {
    const line = lines.get(allocation.lineId);
    checkLine(line, line ? invoices.get(line.invoiceId) : undefined, request.patientId);
    const balance = line.net.minus(line.allocated);
    if (allocation.amount.compare(balance) > 0) {
      throw new DomainError('AMOUNT_EXCEEDS_BALANCE', 'This is more than the line still owes', {
        lineId: line.lineId,
        balance: balance.toDecimalString(),
      });
    }
    const allocatedAfter = line.allocated.plus(allocation.amount);
    return { line, amount: allocation.amount, allocatedAfter };
  });

  const paidNow = new Map<string, Money>();
  for (const row of planned) {
    paidNow.set(
      row.line.invoiceId,
      (paidNow.get(row.line.invoiceId) ?? Money.zero()).plus(row.amount),
    );
  }
  const invoicePlans = [...paidNow].map(([invoiceId, amount]) => {
    const invoice = invoices.get(invoiceId);
    if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found');
    const paidAfter = invoice.paid.plus(amount);
    return {
      invoiceId,
      paidNow: amount,
      paidAfter,
      balanceAfter: invoice.total.minus(paidAfter),
      status: deriveInvoiceStatus({
        total: invoice.total,
        paid: paidAfter,
        activeLines: invoice.activeLines,
      }),
    };
  });
  const balanceAfter = new Map(invoicePlans.map((row) => [row.invoiceId, row.balanceAfter]));

  return {
    lines: planned.map((row) => ({
      lineId: row.line.lineId,
      allocatedAfter: row.allocatedAfter,
      eligibility: eligibilityOf(row.line.net, row.allocatedAfter),
    })),
    invoices: invoicePlans,
    allocations: planned.map((row) => ({
      lineId: row.line.lineId,
      invoiceId: row.line.invoiceId,
      amount: row.amount,
      invoiceBalanceAfter: balanceAfter.get(row.line.invoiceId) ?? Money.zero(),
    })),
  };
}
