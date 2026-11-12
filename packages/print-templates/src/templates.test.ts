import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderLabReportHtml,
  renderReceiptHtml,
  type LabReportData,
  type ReceiptData,
} from './index.js';

// Print templates as HTML (T-PRN-01; ADR-010; FR-PRN-005). PDFs from the same HTML are checked in
// e2e/render-pdf.spec.ts.
const samples = JSON.parse(
  readFileSync(new URL('../fixtures/samples.json', import.meta.url), 'utf8'),
) as { receipt: ReceiptData; labReport: LabReportData };

describe('receipt template', () => {
  it('is A5 portrait (F section 10)', () => {
    expect(renderReceiptHtml(samples.receipt, 'en')).toMatch(/@page\s*\{\s*size:\s*A5 portrait/);
  });

  it('shows one language, or both when bilingual (FR-PRN-005)', () => {
    const { nameEn, nameBn } = samples.receipt.patient;
    const english = renderReceiptHtml(samples.receipt, 'en');
    expect(english).toContain(nameEn);
    expect(english).not.toContain(nameBn);
    const bangla = renderReceiptHtml(samples.receipt, 'bn-BD');
    expect(bangla).toContain(nameBn);
    expect(bangla).not.toContain(nameEn);
    const both = renderReceiptHtml(samples.receipt, 'bilingual');
    expect(both).toContain(nameEn);
    expect(both).toContain(nameBn);
  });

  it('uses Bangla digits for Bangla and shows the record IDs', () => {
    const bangla = renderReceiptHtml(samples.receipt, 'bn-BD');
    expect(bangla).toContain(samples.receipt.receiptNo);
    expect(bangla).toMatch(/৳ [০-৯,]+\.[০-৯]{2}/);
    expect(renderReceiptHtml(samples.receipt, 'en')).toMatch(/৳ [\d,]+\.\d{2}/);
  });

  it('embeds its fonts, so printing needs nothing from the network', () => {
    const html = renderReceiptHtml(samples.receipt, 'bilingual');
    expect(html).toContain('font/woff2;base64,');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('escapes record values, so a name cannot inject markup', () => {
    const patient = { ...samples.receipt.patient, nameEn: '<script>alert(1)</script>' };
    const html = renderReceiptHtml({ ...samples.receipt, patient }, 'en');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('marks copy 2 and later, never the original (FR-BIL-027)', () => {
    expect(renderReceiptHtml({ ...samples.receipt, copyNo: 2 }, 'en')).toContain('Copy 2');
    expect(renderReceiptHtml({ ...samples.receipt, copyNo: 1 }, 'en')).not.toContain('Copy');
    expect(renderReceiptHtml(samples.receipt, 'en')).not.toContain('Copy');
  });

  it('lists each invoice paid, with its type and balance after (C-008, C-039)', () => {
    const html = renderReceiptHtml(samples.receipt, 'en');
    expect(html).toContain('Doctor fee invoice - INV-000311');
    expect(html).toContain('Service invoice - INV-000312');
    expect(html.match(/Balance after this payment/g)).toHaveLength(2);
    expect(html).toContain('Amount received');
  });

  it('shows the provider and reference of a mobile payment (FR-BIL-004)', () => {
    const mobile = {
      ...samples.receipt,
      method: { nameEn: 'Mobile' },
      providerLabel: 'bKash',
      externalReference: 'TX-9K2',
    };
    const html = renderReceiptHtml(mobile, 'en');
    expect(html).toContain('Mobile, bKash');
    expect(html).toContain('TX-9K2');
  });
});

describe('lab report template', () => {
  it('is A4 portrait and marks abnormal results in words, not colour alone', () => {
    const html = renderLabReportHtml(samples.labReport, 'en');
    expect(html).toMatch(/@page\s*\{\s*size:\s*A4 portrait/);
    expect(html).toContain('High');
  });

  it('shows the report version, so a reprint is reproducible (FR-LAB-003)', () => {
    const html = renderLabReportHtml(samples.labReport, 'en');
    expect(html).toContain(`v${samples.labReport.version}`);
  });
});
