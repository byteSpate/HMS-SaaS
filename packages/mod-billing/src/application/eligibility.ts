// The payment gate other modules call (T-ORD-02; FR-BIL-003, FR-LAB-004, FR-RIS-002; C-011,
// C-040; UC-BIL-02 "Gate"; D section 14.2). A department calls it inside its own transaction,
// before it starts the service. The lines are read FOR SHARE, so a cancellation or a future
// reversal of the same line waits for the department's commit instead of slipping between the
// check and the start. Payments are not blocked for long: they only add to a line.
import type { TenantTx } from '@hms/database';
import { Money } from '@hms/domain-kernel';
import { checkEligible } from '../domain/eligibility.js';

/** Prisma returns NUMERIC as Decimal, whose toFixed is exact (ADR-007: no floating point). */
interface Exact {
  toFixed(digits: number): string;
}

interface LockedLine {
  id: string;
  status: string;
  net_amount: Exact;
  allocated_amount: Exact;
  number: string;
}

export async function assertEligible(tx: TenantTx, lineIds: readonly string[]): Promise<void> {
  const ids = [...new Set(lineIds)].sort();
  if (ids.length === 0) return;
  // Sorted IDs take the row locks in one order, so two departments never deadlock.
  const rows = await tx.$queryRaw<LockedLine[]>`
    SELECT l.id, l.status, l.net_amount, l.allocated_amount, i.number
    FROM hms.invoice_line l
    JOIN hms.invoice i ON i.tenant_id = l.tenant_id AND i.id = l.invoice_id
    WHERE l.id = ANY(${ids}::uuid[])
    ORDER BY l.id
    FOR SHARE OF l`;
  checkEligible(
    ids,
    rows.map((row) => ({
      lineId: row.id,
      invoiceNumber: row.number,
      status: row.status,
      net: Money.parse(row.net_amount.toFixed(2)),
      allocated: Money.parse(row.allocated_amount.toFixed(2)),
    })),
  );
}
