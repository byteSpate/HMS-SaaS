// The payment gate rule (T-ORD-02; FR-BIL-003, FR-LAB-004, FR-RIS-002; C-011, C-040; UC-BIL-02
// "Gate"). Pure. A service may start only when each of its invoice lines is ACTIVE and fully paid
// (CP-02 = FULL_PAYMENT; deposits are disabled until Q-004, exceptions until Q-005). A refusal
// names every unpaid line with what is still due on which invoice, so the department can send the
// patient to the cashier with the amount.
import { DomainError, type Money } from '@hms/domain-kernel';
import { eligibilityOf } from './payment.js';

export interface GatedLine {
  lineId: string;
  invoiceNumber: string;
  status: string;
  net: Money;
  allocated: Money;
}

export function checkEligible(lineIds: readonly string[], lines: readonly GatedLine[]): void {
  const byId = new Map(lines.map((line) => [line.lineId, line]));
  const unpaid: { lineId: string; invoiceNumber: string; due: string }[] = [];
  for (const lineId of lineIds) {
    const line = byId.get(lineId);
    if (!line) throw new DomainError('NOT_FOUND', 'Invoice line not found');
    if (line.status !== 'ACTIVE') {
      throw new DomainError('INVALID_TRANSITION', 'The invoice line is cancelled');
    }
    if (eligibilityOf(line.net, line.allocated) === 'NOT_ELIGIBLE') {
      unpaid.push({
        lineId,
        invoiceNumber: line.invoiceNumber,
        due: line.net.minus(line.allocated).toDecimalString(),
      });
    }
  }
  if (unpaid.length > 0) {
    throw new DomainError('PAYMENT_NOT_ELIGIBLE', 'The service is not paid yet', {
      lines: unpaid,
    });
  }
}
