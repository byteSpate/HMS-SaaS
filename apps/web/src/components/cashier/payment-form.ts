// The cashier desk's payment rules (T-BIL-04; FR-BIL-012, FR-BIL-019; C-038, C-039; F section 5
// "Amount entry"). Pure, so they are tested without rendering. Every unpaid line of the patient's
// open invoices starts selected for its full balance; the cashier may deselect a line or type a
// smaller amount for it. The total is what the selected lines add up to. The API still checks
// every amount; these rules only stop a request that would surely be refused.
import type { Invoice, PaymentMethod, RecordPaymentRequest } from '@hms/contracts';
import { compareAmounts, positiveAmountOf, sumAmounts } from '../../money';

export interface LineEntry {
  selected: boolean;
  /** What the cashier typed for this line. */
  amountText: string;
}

export type Selection = Record<string, LineEntry>;

export type LineProblem = 'notAmount' | 'overBalance';

/** FR-BIL-012: every line that still owes, selected for its whole balance. */
export function selectionOf(invoices: readonly Invoice[]): Selection {
  const selection: Selection = {};
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      if (line.status === 'ACTIVE' && line.balance !== '0.00') {
        selection[line.lineId] = { selected: true, amountText: line.balance };
      }
    }
  }
  return selection;
}

/** Why a selected line cannot be paid as typed, or null when it can. */
export function lineProblemOf(entry: LineEntry, balance: string): LineProblem | null {
  if (!entry.selected) return null;
  const amount = positiveAmountOf(entry.amountText);
  if (!amount) return 'notAmount';
  return compareAmounts(amount, balance) > 0 ? 'overBalance' : null;
}

/** The allocations to send, or null when nothing is selected or a selected line has a problem. */
export function allocationsOf(
  invoices: readonly Invoice[],
  selection: Selection,
): RecordPaymentRequest['allocations'] | null {
  const allocations: RecordPaymentRequest['allocations'] = [];
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      const entry = selection[line.lineId];
      if (!entry?.selected) continue;
      const amount = positiveAmountOf(entry.amountText);
      if (!amount || lineProblemOf(entry, line.balance)) return null;
      allocations.push({ lineId: line.lineId, amount });
    }
  }
  return allocations.length > 0 ? allocations : null;
}

export interface MethodDetails {
  method: PaymentMethod;
  providerLabel: string;
  externalReference: string;
}

export function requestOf(
  patientId: string,
  allocations: RecordPaymentRequest['allocations'],
  details: MethodDetails,
): RecordPaymentRequest {
  const providerLabel = details.providerLabel.trim();
  const externalReference = details.externalReference.trim();
  return {
    patientId,
    method: details.method,
    amount: sumAmounts(allocations.map((allocation) => allocation.amount)),
    allocations,
    ...(providerLabel ? { providerLabel } : {}),
    ...(externalReference ? { externalReference } : {}),
  };
}
