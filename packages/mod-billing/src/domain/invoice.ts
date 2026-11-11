// Invoice rules (T-BIL-02; FR-BIL-001, FR-BIL-006, FR-BIL-008, FR-BIL-030; C-008). Pure: which
// invoice a charge goes on, how its line is filed, the status an invoice's amounts give, and when
// a repeated posting is the same posting. Amounts are Money throughout (ADR-007).
import { Money } from '@hms/domain-kernel';

export type InvoiceType = 'DOCTOR_FEE' | 'SERVICE';
export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type LineCategory = 'MEDICINE' | 'NON_MEDICINE';

/** C-008: the doctor's fee has its own invoice; every other service of the visit shares one. */
export function invoiceTypeFor(itemCategory: string): InvoiceType {
  return itemCategory === 'CONSULTATION' ? 'DOCTOR_FEE' : 'SERVICE';
}

/** SRC-B03: medicine is subtotalled apart from everything else. */
export function lineCategoryFor(itemCategory: string): LineCategory {
  return itemCategory === 'MEDICINE' ? 'MEDICINE' : 'NON_MEDICINE';
}

/**
 * FR-BIL-008: the status follows the amounts. An invoice whose lines are all cancelled is
 * CANCELLED; otherwise it is PAID when nothing is owed, PARTIALLY_PAID when something was paid,
 * and ISSUED when nothing was. A new line on a PAID invoice therefore makes it owe again.
 */
export function deriveInvoiceStatus(invoice: {
  total: Money;
  paid: Money;
  activeLines: number;
}): InvoiceStatus {
  if (invoice.activeLines === 0) return 'CANCELLED';
  if (invoice.paid.isZero()) return 'ISSUED';
  return invoice.paid.compare(invoice.total) >= 0 ? 'PAID' : 'PARTIALLY_PAID';
}

export interface ChargeContent {
  patientId: string;
  visitId: string;
  serviceItemId: string;
  practitionerId: string | null;
  quantity: number;
}

/**
 * FR-BIL-006, AT-BIL-009/010: a posting repeated under the same source reference returns the
 * first charge only if it says the same thing; different content is a defect in the caller.
 */
export function sameCharge(stored: ChargeContent, requested: ChargeContent): boolean {
  return (
    stored.patientId === requested.patientId &&
    stored.visitId === requested.visitId &&
    stored.serviceItemId === requested.serviceItemId &&
    stored.practitionerId === requested.practitionerId &&
    stored.quantity === requested.quantity
  );
}

export interface LineAmount {
  category: string;
  amount: Money;
  status: string;
}

/** FR-BIL-030, FR-BIL-031: from the same posted lines as the total, so summary equals detail. */
export function subtotalsOf(lines: readonly LineAmount[]): { medicine: Money; nonMedicine: Money } {
  let medicine = Money.zero();
  let nonMedicine = Money.zero();
  for (const line of lines) {
    if (line.status !== 'ACTIVE') continue;
    if (line.category === 'MEDICINE') medicine = medicine.plus(line.amount);
    else nonMedicine = nonMedicine.plus(line.amount);
  }
  return { medicine, nonMedicine };
}
