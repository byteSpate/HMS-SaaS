// The shared page of every print template (T-PRN-01; ADR-010; FR-PRN-005; C-025; F section 10).
// One HTML and CSS source serves the browser print view and the server PDF. A value never reaches
// the page unescaped: patient names come from people.
import { messages, type Locale, type Messages } from '@hms/i18n';
import { fontFaceCss } from './fonts.js';

export type PrintLanguage = Locale | 'bilingual';
// Full catalog keys, so the unused-key check can see them as literals.
export type PrintLabelKey = `print.${keyof Messages['print']}`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A label from the catalogs: in one language, or `English / Bangla` when bilingual. */
export function label(language: PrintLanguage, key: PrintLabelKey): string {
  const name = key.slice('print.'.length) as keyof Messages['print'];
  if (language !== 'bilingual') return escapeHtml(messages[language].print[name]);
  return `${escapeHtml(messages.en.print[name])} / ${escapeHtml(messages['bn-BD'].print[name])}`;
}

/** A value held in both languages; a missing translation falls back to the one that exists. */
export function bothNames(language: PrintLanguage, nameEn: string, nameBn?: string): string {
  if (language === 'en' || !nameBn) return escapeHtml(nameEn);
  if (language === 'bn-BD') return escapeHtml(nameBn);
  return `${escapeHtml(nameEn)} / ${escapeHtml(nameBn)}`;
}

/** Digits follow the language. Bilingual uses Latin digits until CP-18 settles it. */
export function digitsLocale(language: PrintLanguage): Locale {
  return language === 'bn-BD' ? 'bn-BD' : 'en';
}

export interface HospitalHeader {
  nameEn: string;
  nameBn?: string;
  addressEn: string;
  addressBn?: string;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; font: 10.5pt/1.5 'Print Sans', sans-serif; }
  header { border-bottom: 1.5pt solid #000; padding-bottom: 6pt; margin-bottom: 8pt; text-align: center; }
  h1 { margin: 0; font-size: 14pt; }
  h2 { margin: 8pt 0; font-size: 12pt; text-align: center; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 3pt 4pt; border-bottom: 0.5pt solid #000; text-align: start; vertical-align: top; }
  .number { text-align: end; font-variant-numeric: tabular-nums; }
  .facts { margin-bottom: 8pt; }
  .facts th, .facts td { border: 0; padding: 1pt 4pt 1pt 0; }
  .facts th { font-weight: 500; white-space: nowrap; width: 1%; }
  .total th, .total td { font-weight: 700; border-top: 1pt solid #000; }
  .flag { font-weight: 700; }
  .stamp { border: 1pt solid #000; display: inline-block; font-weight: 700; padding: 1pt 6pt; }
  footer { margin-top: 12pt; font-size: 8.5pt; }
`;

export function printDocument(options: {
  title: string;
  page: 'A4 portrait' | 'A5 portrait';
  language: PrintLanguage;
  hospital: HospitalHeader;
  body: string;
}): string {
  const { hospital, language } = options;
  const htmlLang = language === 'en' ? 'en' : 'bn';
  const address = bothNames(language, hospital.addressEn, hospital.addressBn);
  return `<!doctype html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(options.title)}</title>
<style>
@page { size: ${options.page}; margin: 10mm; }
${fontFaceCss()}
${BASE_CSS}
</style>
</head>
<body>
<header>
<h1>${bothNames(language, hospital.nameEn, hospital.nameBn)}</h1>
<div>${address}</div>
</header>
${options.body}
</body>
</html>`;
}
