// What a printed receipt shows, from the stored payment (T-BIL-04; FR-BIL-027; C-008, C-039).
// Pure: the payment, the hospital's names, the copy number and the print time become the
// template's data. Names of system items and methods come from the catalogs, so the receipt says
// "Doctor fee: new patient" in the print language, never a code.
import type { PaidLine, Payment, PaymentMethod } from '@hms/contracts';
import { messages } from '@hms/i18n';
import type { ReceiptData } from '@hms/print-templates';

const en = messages.en;
const bn = messages['bn-BD'];

const SYSTEM_ITEMS: Record<string, 'doctorFeeNew' | 'doctorFeeFollowUp'> = {
  DOCTOR_FEE_NEW: 'doctorFeeNew',
  DOCTOR_FEE_FOLLOW_UP: 'doctorFeeFollowUp',
};

const METHODS: Record<PaymentMethod, `method${PaymentMethod}`> = {
  CASH: 'methodCASH',
  CARD: 'methodCARD',
  MOBILE: 'methodMOBILE',
  BANK_TRANSFER: 'methodBANK_TRANSFER',
};

/** A line as the receipt names it: the item, and the doctor of a doctor fee. */
function describe(line: PaidLine): { descriptionEn: string; descriptionBn?: string } {
  const system = SYSTEM_ITEMS[line.itemCode];
  const itemEn = system ? en.print[system] : (line.itemNameEn ?? line.itemNameBn ?? line.itemCode);
  const itemBn = system ? bn.print[system] : (line.itemNameBn ?? undefined);
  const doctorEn = line.practitioner?.nameEn ?? line.practitioner?.nameBn;
  const doctorBn = line.practitioner?.nameBn ?? doctorEn;
  return {
    descriptionEn: doctorEn ? `${itemEn} (${doctorEn})` : itemEn,
    ...(itemBn ? { descriptionBn: doctorBn ? `${itemBn} (${doctorBn})` : itemBn } : {}),
  };
}

export function receiptDataOf(
  payment: Payment,
  hospital: { nameEn: string; nameBn?: string },
  copyNo: number,
  printedAt: Date,
): ReceiptData {
  const method = METHODS[payment.method];
  return {
    hospital,
    receiptNo: payment.receiptNumber,
    paidAt: payment.receivedAt,
    patient: {
      nameEn: payment.patient.nameEn ?? payment.patient.nameBn ?? '',
      ...(payment.patient.nameBn ? { nameBn: payment.patient.nameBn } : {}),
      mrn: payment.patient.mrn,
    },
    invoices: payment.invoices.map((invoice) => ({
      kind: invoice.type,
      number: invoice.number,
      lines: invoice.lines.map((line) => ({ ...describe(line), amount: line.amount })),
      paid: invoice.paid,
      balanceAfter: invoice.balanceAfter,
    })),
    amountReceived: payment.amount,
    method: { nameEn: en.cashier[method], nameBn: bn.cashier[method] },
    ...(payment.providerLabel ? { providerLabel: payment.providerLabel } : {}),
    ...(payment.externalReference ? { externalReference: payment.externalReference } : {}),
    cashier: payment.cashier.displayName,
    printedAt: printedAt.toISOString(),
    copyNo,
  };
}
