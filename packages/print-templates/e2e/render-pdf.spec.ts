// Renders the templates to PDF with Chromium and keeps samples for review (T-PRN-01; ADR-010;
// FR-PRN-005, FR-PRN-006). Run locally to refresh docs/deliverables/print-samples. Whether the Bangla
// reads correctly is a native speaker's call; this checks what a machine can.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  renderLabReportHtml,
  renderReceiptHtml,
  type LabReportData,
  type PrintLanguage,
  type ReceiptData,
} from '../src/index.js';

const samples = JSON.parse(
  readFileSync(new URL('../fixtures/samples.json', import.meta.url), 'utf8'),
) as { receipt: ReceiptData; labReport: LabReportData };
const outputDir = new URL('../../../docs/deliverables/print-samples/', import.meta.url);

const DOCUMENTS: { name: string; size: [number, number]; html: string }[] = [
  ...(['bilingual', 'bn-BD', 'en'] as PrintLanguage[]).map((language) => ({
    name: `receipt-${language}`,
    size: [420, 595] as [number, number],
    html: renderReceiptHtml(samples.receipt, language),
  })),
  ...(['bilingual', 'bn-BD', 'en'] as PrintLanguage[]).map((language) => ({
    name: `lab-report-${language}`,
    size: [595, 842] as [number, number],
    html: renderLabReportHtml(samples.labReport, language),
  })),
];

for (const document of DOCUMENTS) {
  test(`renders ${document.name} to one PDF page with embedded fonts`, async ({ page }) => {
    // The renderer runs with no network (ADR-010): any request here would fail in production.
    const requests: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('data:')) requests.push(request.url());
    });
    await page.setContent(document.html, { waitUntil: 'load' });
    await page.evaluate(() => globalThis.document.fonts.ready);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(new URL(`${document.name}.pdf`, outputDir), pdf);

    const raw = pdf.toString('latin1');
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(requests).toEqual([]);
    expect(raw.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
    expect(raw).toMatch(/FontFile/);
    expect(raw).toMatch(/NotoSansBengali/);
    const [width, height] = document.size;
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(raw);
    expect(Math.abs(Number(box?.[1]) - width)).toBeLessThan(2);
    expect(Math.abs(Number(box?.[2]) - height)).toBeLessThan(2);
  });
}
