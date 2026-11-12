// Print templates: one HTML and CSS source for the browser print view and the server PDF (ADR-010).
export { type HospitalHeader, type PrintLanguage } from './document.js';
export { renderLabReportHtml, type LabReportData, type ResultFlag } from './lab-report.js';
export { renderReceiptHtml, type ReceiptData, type ReceiptInvoice } from './receipt.js';
