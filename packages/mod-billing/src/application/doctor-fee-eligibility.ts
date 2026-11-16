// Whether each visit's doctor fee lets the consultation start (T-CLI-01; FR-CLI-002; CP-02, C-009,
// C-011, C-040). Exported for the clinical module's worklist and start check: billing owns the
// invoice tables, so the answer is read here. A doctor-fee invoice is eligible when every active
// line is ELIGIBLE, which the payment transaction keeps (C-040 FULL_PAYMENT). A visit with no
// doctor-fee invoice (no fee configured at check-in, UC-VIS-01 A1) is missing from the map: there
// is nothing to pay, and the caller decides what that means.
import type { TenantTx } from '@hms/database';
import type { Eligibility } from '../domain/payment.js';

export async function doctorFeeEligibilityOf(
  tx: TenantTx,
  visitIds: readonly string[],
): Promise<Map<string, Eligibility>> {
  if (visitIds.length === 0) return new Map();
  const invoices = await tx.invoice.findMany({
    where: {
      visitId: { in: [...new Set(visitIds)] },
      type: 'DOCTOR_FEE',
      status: { not: 'CANCELLED' },
    },
    select: {
      visitId: true,
      lines: { where: { status: 'ACTIVE' }, select: { eligibility: true } },
    },
  });
  return new Map(
    invoices.map((invoice) => [
      invoice.visitId,
      invoice.lines.length > 0 && invoice.lines.every((line) => line.eligibility === 'ELIGIBLE')
        ? 'ELIGIBLE'
        : 'NOT_ELIGIBLE',
    ]),
  );
}
