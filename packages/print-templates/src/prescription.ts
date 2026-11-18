// Prescription, A4 portrait (T-CLI-03; FR-CLI-005, FR-CLI-006, FR-CLI-007; C-025, C-044; F section
// 10). Doctor header (name, degrees, registration), patient banner, date, allergy status, the
// lines as signed, advice, next visit if booked, a signature line and "Signed electronically by".
// An amended prescription says "Amended" with the date. Allergy data that is missing prints as
// "Not recorded", never as "no allergies" (FR-CLI-007). Printing changes nothing (FPR-07).
import { formatDate, formatDateTime, messages, toLocaleDigits, type Messages } from '@hms/i18n';
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

/** A hospital list label: Bangla and/or English. */
export interface PrintTerm {
  labelEn: string | null;
  labelBn: string | null;
}

export interface PrescriptionPrintLine {
  /** Brand, strength and form, for example "Napa 500 mg Tablet". */
  medicine: string;
  genericName: string;
  dose: string | null;
  route: PrintTerm | null;
  frequency: PrintTerm | null;
  duration: PrintTerm | null;
  instructionsEn: string | null;
  instructionsBn: string | null;
  quantity: number | null;
  fulfilment: 'HOSPITAL_PHARMACY' | 'EXTERNAL';
}

export type PrintAllergies =
  | { status: 'KNOWN_ALLERGIES'; items: string[] }
  | { status: 'NO_KNOWN_ALLERGIES' }
  | { status: 'NOT_ASKED' }
  /** No signed note: nothing was recorded, which is not "no allergies". */
  | { status: 'NOT_RECORDED' };

export interface PrescriptionPrintData {
  hospital: HospitalHeader;
  doctor: {
    nameEn: string;
    nameBn?: string;
    degrees?: string;
    specialty?: string;
    registrationNo?: string;
  };
  patient: { nameEn: string; nameBn?: string; mrn: string };
  allergies: PrintAllergies;
  lines: PrescriptionPrintLine[];
  advice?: string;
  /** YYYY-MM-DD of the patient's next booked visit with this doctor. */
  nextVisit?: string;
  signedBy: string;
  signedAt: string;
  /** Set for version 2 and later (UC-CLI-02). */
  amended: boolean;
}

function termText(language: PrintLanguage, term: PrintTerm | null): string {
  if (!term) return '';
  const english = term.labelEn ?? term.labelBn ?? '';
  return bothNames(language, english, term.labelBn ?? undefined);
}

/** The instructions in the print language; the other language fills a missing one. */
function instructionsText(language: PrintLanguage, line: PrescriptionPrintLine): string {
  const en = line.instructionsEn;
  const bn = line.instructionsBn;
  if (language === 'bilingual' && en && bn) return `${escapeHtml(en)} / ${escapeHtml(bn)}`;
  const text = language === 'en' ? (en ?? bn) : (bn ?? en);
  return text ? escapeHtml(text) : '';
}

function allergiesText(language: PrintLanguage, allergies: PrintAllergies): string {
  switch (allergies.status) {
    case 'KNOWN_ALLERGIES':
      return `<span class="flag">${allergies.items.map(escapeHtml).join(', ')}</span>`;
    case 'NO_KNOWN_ALLERGIES':
      return label(language, 'print.allergiesNone');
    case 'NOT_ASKED':
      return label(language, 'print.allergiesNotAsked');
    case 'NOT_RECORDED':
      return label(language, 'print.allergiesNotRecorded');
  }
}

// The full catalog key, so the unused-key check sees it; filled with the name and time.
const SIGNED_KEY: PrintLabelKey = 'print.signedElectronically';

/** "Signed electronically by {name} at {time}" in the print language(s). */
function signedText(language: PrintLanguage, name: string, time: string): string {
  const field = SIGNED_KEY.slice('print.'.length) as keyof Messages['print'];
  const fill = (template: string) =>
    escapeHtml(template.replace('{name}', name).replace('{time}', time));
  if (language === 'bilingual') {
    return `${fill(messages.en.print[field])} / ${fill(messages['bn-BD'].print[field])}`;
  }
  return fill(messages[language].print[field]);
}

function lineRow(language: PrintLanguage, line: PrescriptionPrintLine, index: number): string {
  const digits = digitsLocale(language);
  const how = [
    line.dose ? escapeHtml(line.dose) : '',
    termText(language, line.route),
    termText(language, line.frequency),
    termText(language, line.duration),
  ]
    .filter((part) => part !== '')
    .join(' - ');
  const instructions = instructionsText(language, line);
  const supply = label(
    language,
    line.fulfilment === 'HOSPITAL_PHARMACY' ? 'print.supplyHospital' : 'print.supplyExternal',
  );
  const quantity =
    line.quantity === null ? '' : escapeHtml(toLocaleDigits(String(line.quantity), digits));
  return `<tr>
    <td class="number">${escapeHtml(toLocaleDigits(String(index + 1), digits))}.</td>
    <td><strong>${escapeHtml(line.medicine)}</strong><div>${escapeHtml(line.genericName)}</div></td>
    <td>${how}${instructions ? `<div>${instructions}</div>` : ''}</td>
    <td class="number">${quantity}</td>
    <td>${supply}</td>
  </tr>`;
}

export function renderPrescriptionHtml(
  prescription: PrescriptionPrintData,
  language: PrintLanguage,
): string {
  const digits = digitsLocale(language);
  const { doctor, patient } = prescription;
  const signedTime = formatDateTime(prescription.signedAt, digits);
  const doctorFacts = [
    doctor.degrees ? escapeHtml(doctor.degrees) : '',
    doctor.specialty ? escapeHtml(doctor.specialty) : '',
    doctor.registrationNo
      ? `${label(language, 'print.registrationNo')} ${escapeHtml(doctor.registrationNo)}`
      : '',
  ].filter((part) => part !== '');
  const amended = prescription.amended
    ? ` <span class="stamp">${label(language, 'print.amended')} ${escapeHtml(formatDate(prescription.signedAt, digits))}</span>`
    : '';
  const advice = prescription.advice
    ? `<h3>${label(language, 'print.advice')}</h3><p>${escapeHtml(prescription.advice)}</p>`
    : '';
  const nextVisit = prescription.nextVisit
    ? `<p><strong>${label(language, 'print.nextVisit')}:</strong> ${escapeHtml(formatDate(prescription.nextVisit, digits))}</p>`
    : '';
  const body = `
<section style="margin-bottom: 6pt">
  <strong>${bothNames(language, doctor.nameEn, doctor.nameBn)}</strong>
  ${doctorFacts.map((fact) => `<div>${fact}</div>`).join('')}
</section>
<h2>${label(language, 'print.prescription')}${amended}</h2>
<table class="facts">
  <tr><th>${label(language, 'print.patient')}</th><td>${bothNames(language, patient.nameEn, patient.nameBn)}</td>
      <th>${label(language, 'print.mrn')}</th><td>${escapeHtml(patient.mrn)}</td></tr>
  <tr><th>${label(language, 'print.date')}</th><td>${escapeHtml(formatDate(prescription.signedAt, digits))}</td>
      <th>${label(language, 'print.allergies')}</th><td>${allergiesText(language, prescription.allergies)}</td></tr>
</table>
<p style="margin: 6pt 0 2pt; font-size: 16pt; font-weight: 700">&#8478;</p>
<table>
  <thead><tr>
    <th class="number">#</th>
    <th>${label(language, 'print.medicine')}</th>
    <th>${label(language, 'print.dose')}</th>
    <th class="number">${label(language, 'print.quantity')}</th>
    <th>${label(language, 'print.supply')}</th>
  </tr></thead>
  <tbody>${prescription.lines.map((line, index) => lineRow(language, line, index)).join('')}</tbody>
</table>
${advice}
${nextVisit}
<footer>
  <p style="margin-top: 24pt; text-align: end">${label(language, 'print.signature')}: ______________________</p>
  <p>${signedText(language, prescription.signedBy, signedTime)}</p>
</footer>`;
  return printDocument({
    title: label(language, 'print.prescription'),
    page: 'A4 portrait',
    language,
    hospital: prescription.hospital,
    body,
  });
}
