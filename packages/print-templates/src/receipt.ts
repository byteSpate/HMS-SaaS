// Money receipt, A5 portrait (T-PRN-01; FR-PRN-005, FR-BIL-027; F section 10). A spike template:
// T-PRN-02 adds the remaining documents and the template versions. Printing changes nothing (FPR-07).
import { formatDateTime, formatMoney } from '@hms/i18n';
import {
  bothNames,
  digitsLocale,
  escapeHtml,
  label,
  printDocument,
  type HospitalHeader,
  type PrintLanguage,
} from './document.js';

export interface ReceiptData {
  hospital: HospitalHeader;
  receiptNo: string;
  paidAt: string;
  patient: { nameEn: string; nameBn?: string; mrn: string };
  lines: { descriptionEn: string; descriptionBn?: string; amount: string }[];
  total: string;
  paid: string;
  balance: string;
  method: { nameEn: string; nameBn?: string };
  cashier: string;
  printedAt: string;
  /** FR-BIL-027: a later copy says so, so it cannot pass as the original. */
  reprint?: boolean;
}

export function renderReceiptHtml(receipt: ReceiptData, language: PrintLanguage): string {
  const digits = digitsLocale(language);
  const money = (amount: string) => escapeHtml(formatMoney(amount, digits, { symbol: 'sign' }));
  const time = (instant: string) => escapeHtml(formatDateTime(instant, digits));
  const lines = receipt.lines
    .map(
      (line) => `<tr>
        <td>${bothNames(language, line.descriptionEn, line.descriptionBn)}</td>
        <td class="number">${money(line.amount)}</td>
      </tr>`,
    )
    .join('');
  const body = `
<h2>${label(language, 'print.moneyReceipt')}${
    receipt.reprint ? ` <span class="stamp">${label(language, 'print.reprint')}</span>` : ''
  }</h2>
<table class="facts">
  <tr><th>${label(language, 'print.receiptNo')}</th><td>${escapeHtml(receipt.receiptNo)}</td></tr>
  <tr><th>${label(language, 'print.dateTime')}</th><td>${time(receipt.paidAt)}</td></tr>
  <tr><th>${label(language, 'print.patient')}</th><td>${bothNames(language, receipt.patient.nameEn, receipt.patient.nameBn)}</td></tr>
  <tr><th>${label(language, 'print.mrn')}</th><td>${escapeHtml(receipt.patient.mrn)}</td></tr>
</table>
<table>
  <thead><tr><th>${label(language, 'print.description')}</th><th class="number">${label(language, 'print.amount')}</th></tr></thead>
  <tbody>${lines}</tbody>
  <tfoot>
    <tr class="total"><th>${label(language, 'print.total')}</th><td class="number">${money(receipt.total)}</td></tr>
    <tr><th>${label(language, 'print.paid')}</th><td class="number">${money(receipt.paid)}</td></tr>
    <tr><th>${label(language, 'print.balance')}</th><td class="number">${money(receipt.balance)}</td></tr>
  </tfoot>
</table>
<footer>
  ${label(language, 'print.paymentMethod')}: ${bothNames(language, receipt.method.nameEn, receipt.method.nameBn)}<br>
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
