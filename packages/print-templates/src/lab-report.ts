// Lab report, A4 portrait (T-PRN-01; ADR-010; FR-PRN-006, FR-LAB-003; F section 10). A spike template:
// T-LAB-08 completes it. Reference ranges come from the record: the product has no defaults (CP-14).
// An abnormal result is marked in words, because reports are often printed in black and white.
import { formatDateTime } from '@hms/i18n';
import {
  bothNames,
  digitsLocale,
  escapeHtml,
  label,
  printDocument,
  type HospitalHeader,
  type PrintLabelKey,
  type PrintLanguage,
} from './document.js';

export type ResultFlag = 'LOW' | 'NORMAL' | 'HIGH';

const FLAG_LABELS: Record<ResultFlag, PrintLabelKey | null> = {
  LOW: 'print.flagLow',
  NORMAL: null,
  HIGH: 'print.flagHigh',
};

export interface LabReportData {
  hospital: HospitalHeader;
  reportNo: string;
  version: number;
  section: { nameEn: string; nameBn?: string };
  patient: { nameEn: string; nameBn?: string; mrn: string; ageSex: string };
  referringDoctor: string;
  specimenNo: string;
  collectedAt: string;
  releasedAt: string;
  results: {
    test: string;
    value: string;
    unit: string;
    referenceRange: string;
    flag: ResultFlag;
  }[];
  verifiedBy: string;
  releasedBy: string;
  printedAt: string;
}

export function renderLabReportHtml(report: LabReportData, language: PrintLanguage): string {
  const time = (instant: string) => escapeHtml(formatDateTime(instant, digitsLocale(language)));
  const rows = report.results
    .map((result) => {
      const flag = FLAG_LABELS[result.flag];
      return `<tr>
        <td>${escapeHtml(result.test)}</td>
        <td class="number">${escapeHtml(result.value)}</td>
        <td>${escapeHtml(result.unit)}</td>
        <td>${escapeHtml(result.referenceRange)}</td>
        <td class="flag">${flag ? label(language, flag) : ''}</td>
      </tr>`;
    })
    .join('');
  const body = `
<h2>${label(language, 'print.labReport')}: ${bothNames(language, report.section.nameEn, report.section.nameBn)}</h2>
<table class="facts">
  <tr><th>${label(language, 'print.reportNo')}</th><td>${escapeHtml(report.reportNo)} (v${report.version})</td></tr>
  <tr><th>${label(language, 'print.patient')}</th><td>${bothNames(language, report.patient.nameEn, report.patient.nameBn)}</td></tr>
  <tr><th>${label(language, 'print.mrn')}</th><td>${escapeHtml(report.patient.mrn)}</td></tr>
  <tr><th>${label(language, 'print.ageSex')}</th><td>${escapeHtml(report.patient.ageSex)}</td></tr>
  <tr><th>${label(language, 'print.referringDoctor')}</th><td>${escapeHtml(report.referringDoctor)}</td></tr>
  <tr><th>${label(language, 'print.specimenNo')}</th><td>${escapeHtml(report.specimenNo)}</td></tr>
  <tr><th>${label(language, 'print.collectedAt')}</th><td>${time(report.collectedAt)}</td></tr>
  <tr><th>${label(language, 'print.releasedAt')}</th><td>${time(report.releasedAt)}</td></tr>
</table>
<table>
  <thead><tr>
    <th>${label(language, 'print.test')}</th>
    <th class="number">${label(language, 'print.result')}</th>
    <th>${label(language, 'print.unit')}</th>
    <th>${label(language, 'print.referenceRange')}</th>
    <th>${label(language, 'print.flag')}</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<footer>
  ${label(language, 'print.verifiedBy')}: ${escapeHtml(report.verifiedBy)}<br>
  ${label(language, 'print.releasedBy')}: ${escapeHtml(report.releasedBy)}<br>
  ${label(language, 'print.printedAt')}: ${time(report.printedAt)}
</footer>`;
  return printDocument({
    title: `${report.reportNo} v${report.version}`,
    page: 'A4 portrait',
    language,
    hospital: report.hospital,
    body,
  });
}
