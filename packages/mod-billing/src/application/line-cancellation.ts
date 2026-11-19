// Cancelling an unpaid invoice line (T-ORD-03; FR-BIL-020, FR-ORD-006 interim; UC-ORD-02 step 2;
// Q-017). Other modules call it in their own transaction when an order is cancelled. The invoice
// is locked like a payment locks it (FR-BIL-034), so a payment and a cancellation of the same line
// queue instead of racing. Only an ACTIVE line with nothing paid is cancelled; a paid line needs
// the reversal Q-017 has not defined, so it is FEATURE_NOT_AVAILABLE. The line stays on the
// invoice as CANCELLED and the total drops by its amount (FR-BIL-031).
import type { TenantTx } from '@hms/database';
import { DomainError } from '@hms/domain-kernel';
import { recordChange, type Scope } from '@hms/platform';
import { deriveInvoiceStatus } from '../domain/invoice.js';
import { invoiceAmounts, setInvoiceStatus } from '../infrastructure/invoice.repository.js';
import { lockInvoices } from '../infrastructure/payment.repository.js';

const notAvailable = () =>
  new DomainError(
    'FEATURE_NOT_AVAILABLE',
    'Cancelling after payment or after work has started is not configured; see a supervisor',
  );

export async function cancelUnpaidLine(
  tx: TenantTx,
  scope: Scope,
  request: { lineId: string; reason: string },
  at: Date,
): Promise<void> {
  const line = await tx.invoiceLine.findUnique({
    where: { id: request.lineId },
    select: { invoiceId: true },
  });
  if (!line) throw new DomainError('NOT_FOUND', 'Invoice line not found');
  await lockInvoices(tx, [line.invoiceId]);
  // Read again under the lock: a payment may have just allocated to it.
  const locked = await tx.invoiceLine.findUniqueOrThrow({
    where: { id: request.lineId },
    select: { status: true, netAmount: true, allocatedAmount: true, invoiceId: true },
  });
  if (locked.status !== 'ACTIVE') {
    throw new DomainError('INVALID_TRANSITION', 'The invoice line is already cancelled');
  }
  if (!locked.allocatedAmount.isZero()) throw notAvailable();
  await tx.invoiceLine.update({
    where: { id: request.lineId },
    data: { status: 'CANCELLED', updatedAt: at, version: { increment: 1 } },
    select: { id: true },
  });
  await tx.invoice.update({
    where: { id: locked.invoiceId },
    data: {
      total: { decrement: locked.netAmount },
      updatedAt: at,
      version: { increment: 1 },
    },
    select: { id: true },
  });
  await setInvoiceStatus(
    tx,
    locked.invoiceId,
    deriveInvoiceStatus(await invoiceAmounts(tx, locked.invoiceId)),
  );
  await recordChange(tx, scope, {
    action: 'billing.line.cancelled',
    eventType: 'InvoiceLineCancelled',
    targetType: 'invoice_line',
    targetId: request.lineId,
    details: { invoiceId: locked.invoiceId, amount: locked.netAmount.toFixed(2) },
  });
}
