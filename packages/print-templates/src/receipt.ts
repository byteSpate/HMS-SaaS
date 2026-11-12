// Money receipt, A5 portrait (T-PRN-01, T-BIL-04; FR-PRN-005, FR-BIL-027; C-008, C-039; F section
// 10). One payment may pay several invoices of a patient (C-039): the receipt lists each invoice
// with its type, the lines paid, what this payment paid of it and its balance after. A later print
// says "Copy n", so it cannot pass as the original. Printing changes nothing (FPR-07).
import { formatDateTime, formatMoney, toLocaleDigits } from '@hms/i18n';
import {
  bothNames,
  digitsLocale,
  escapeHtml,
  label,
  printDocument,
  type HospitalHeader,
  type PrintLanguage,
} from './document.js';

export interface ReceiptInvoice {
  /** C-008: the doctor's fee and services are separate invoices. */
  kind: 'DOCTOR_FEE' | 'SERVICE';
  number: string;
  lines: { descriptionEn: string; descriptionBn?: string; amount: string }[];
  /** What this payment paid of the invoice. */
  paid: string;
  /** FR-BIL-027: the invoice's balance right after this payment. */
  balanceAfter: string;
}

export interface ReceiptData {
  hospital: HospitalHeader;
  receiptNo: string;
  paidAt: string;
  patient: { nameEn: string; nameBn?: string; mrn: string };
  invoices: ReceiptInvoice[];
  amountReceived: string;
  method: { nameEn: string; nameBn?: string };
  /** FR-BIL-004: for example "bKash", and the transaction or slip number. */
  providerLabel?: string;
  externalReference?: string;
  cashier: string;
  printedAt: string;
  /** FR-BIL-027: the print's copy number; 2 and later are marked. Omitted for the original. */
  copyNo?: number;
}

function invoiceSection(
  invoice: ReceiptInvoice,
  language: PrintLanguage,
  money: (amount: string) => string,
): string {
  const kind = label(
    language,
    invoice.kind === 'DOCTOR_FEE' ? 'print.invoiceDoctorFee' : 'print.invoiceService',
  );
  const lines = invoice.lines
    .map(
      (line) => `<tr>
        <td>${bothNames(language, line.descriptionEn, line.descriptionBn)}</td>
        <td class="number">${money(line.amount)}</td>
      </tr>`,
    )
    .join('');
  return `
<h3>${kind} - ${escapeHtml(invoice.number)}</h3>
<table>
  <thead><tr><th>${label(language, 'print.description')}</th><th class="number">${label(language, 'print.amount')}</th></tr></thead>
  <tbody>${lines}</tbody>
  <tfoot>
    <tr class="total"><th>${label(language, 'print.paid')}</th><td class="number">${money(invoice.paid)}</td></tr>
    <tr><th>${label(language, 'print.balanceAfter')}</th><td class="number">${money(invoice.balanceAfter)}</td></tr>
  </tfoot>
</table>`;
}

export function renderReceiptHtml(receipt: ReceiptData, language: PrintLanguage): string {
  const digits = digitsLocale(language);
  const money = (amount: string) => escapeHtml(formatMoney(amount, digits, { symbol: 'sign' }));
  const time = (instant: string) => escapeHtml(formatDateTime(instant, digits));
  const copy =
    receipt.copyNo !== undefined && receipt.copyNo > 1
      ? ` <span class="stamp">${label(language, 'print.copy')} ${escapeHtml(toLocaleDigits(String(receipt.copyNo), digits))}</span>`
      : '';
  const method = [
    bothNames(language, receipt.method.nameEn, receipt.method.nameBn),
    ...(receipt.providerLabel ? [escapeHtml(receipt.providerLabel)] : []),
  ].join(', ');
  const body = `
<h2>${label(language, 'print.moneyReceipt')}${copy}</h2>
<table class="facts">
  <tr><th>${label(language, 'print.receiptNo')}</th><td>${escapeHtml(receipt.receiptNo)}</td></tr>
  <tr><th>${label(language, 'print.dateTime')}</th><td>${time(receipt.paidAt)}</td></tr>
  <tr><th>${label(language, 'print.patient')}</th><td>${bothNames(language, receipt.patient.nameEn, receipt.patient.nameBn)}</td></tr>
  <tr><th>${label(language, 'print.mrn')}</th><td>${escapeHtml(receipt.patient.mrn)}</td></tr>
</table>
${receipt.invoices.map((invoice) => invoiceSection(invoice, language, money)).join('')}
<table class="facts received">
  <tr class="total"><th>${label(language, 'print.amountReceived')}</th><td class="number">${money(receipt.amountReceived)}</td></tr>
  <tr><th>${label(language, 'print.paymentMethod')}</th><td>${method}</td></tr>
  ${
    receipt.externalReference
      ? `<tr><th>${label(language, 'print.reference')}</th><td>${escapeHtml(receipt.externalReference)}</td></tr>`
      : ''
  }
</table>
<footer>
  ${label(language, 'print.receivedBy')}: ${escapeHtml(receipt.cashier)}<br>
  ${label(language, 'print.printedAt')}: ${time(receipt.printedAt)}
</footer>`;
  return printDocument({
    title: receipt.receiptNo,
    page: 'A5 portrait',
    language,
    hospital: receipt.hospital,
    body,
  });
}
