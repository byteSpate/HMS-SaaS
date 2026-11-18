// The prescription editor's form state and the request it sends (T-CLI-03; FR-CLI-004..006;
// Q-067 interim). Pure, so the rules are tested without rendering. Inputs hold text; a blank text
// is sent as null, a blank list choice as no choice. A line keeps the medicine the doctor picked.
import type {
  Fulfilment,
  MedicineChoice,
  PrescribingTermChoice,
  PrescriptionContent,
  PrescriptionLineInput,
} from '@hms/contracts';
import type { Locale } from '@hms/i18n';

export interface LineForm {
  lineId: string;
  medicine: MedicineChoice;
  dose: string;
  /** '' for no choice. */
  routeTermId: string;
  frequencyTermId: string;
  durationTermId: string;
  instructionsBn: string;
  instructionsEn: string;
  quantity: string;
  fulfilment: Fulfilment;
  patientNote: string;
}

export function newLine(medicine: MedicineChoice, lineId: string): LineForm {
  return {
    lineId,
    medicine,
    dose: '',
    routeTermId: '',
    frequencyTermId: '',
    durationTermId: '',
    instructionsBn: '',
    instructionsEn: '',
    quantity: '',
    // FR-CLI-006: the hospital pharmacy unless the doctor says otherwise.
    fulfilment: 'HOSPITAL_PHARMACY',
    patientNote: '',
  };
}

export function linesFormOf(content: PrescriptionContent | null): LineForm[] {
  return (content?.lines ?? []).map((line) => ({
    lineId: line.lineId,
    medicine: line.medicine,
    dose: line.dose ?? '',
    routeTermId: line.routeTermId ?? '',
    frequencyTermId: line.frequencyTermId ?? '',
    durationTermId: line.durationTermId ?? '',
    instructionsBn: line.instructionsBn ?? '',
    instructionsEn: line.instructionsEn ?? '',
    quantity: line.quantity === null ? '' : String(line.quantity),
    fulfilment: line.fulfilment,
    patientNote: line.patientNote ?? '',
  }));
}

const text = (value: string) => (value.trim() === '' ? null : value.trim());
const choice = (value: string) => (value === '' ? null : value);

/** The quantity as a whole number 1-9999, null when blank, undefined when not valid. */
export function quantityOf(line: LineForm): number | null | undefined {
  const value = line.quantity.trim();
  if (value === '') return null;
  if (!/^\d{1,4}$/.test(value) || Number(value) < 1) return undefined;
  return Number(value);
}

/** The request lines, or null while a quantity is not a valid number. */
export function linesOf(lines: readonly LineForm[]): PrescriptionLineInput[] | null {
  const inputs: PrescriptionLineInput[] = [];
  for (const line of lines) {
    const quantity = quantityOf(line);
    if (quantity === undefined) return null;
    inputs.push({
      lineId: line.lineId,
      medicineId: line.medicine.medicineId,
      dose: text(line.dose),
      routeTermId: choice(line.routeTermId),
      frequencyTermId: choice(line.frequencyTermId),
      durationTermId: choice(line.durationTermId),
      instructionsBn: text(line.instructionsBn),
      instructionsEn: text(line.instructionsEn),
      quantity,
      fulfilment: line.fulfilment,
      patientNote: text(line.patientNote),
    });
  }
  return inputs;
}

/** True when the lines are what the server already holds, so no save is needed. */
export function sameLines(
  inputs: readonly PrescriptionLineInput[],
  saved: PrescriptionContent | null,
): boolean {
  const stored = saved?.lines ?? [];
  if (stored.length !== inputs.length) return false;
  return inputs.every((input, index) => {
    const line = stored[index];
    return (
      line !== undefined &&
      (Object.keys(input) as (keyof PrescriptionLineInput)[]).every(
        (field) => input[field] === line[field],
      )
    );
  });
}

/** A line says how to take the medicine: how often, or instructions (the API's sign rule). */
export function saysHowToTake(line: LineForm): boolean {
  return (
    line.frequencyTermId !== '' ||
    text(line.instructionsBn) !== null ||
    text(line.instructionsEn) !== null
  );
}

/** The sign rule: at least one line, each saying how to take it, every quantity valid. */
export function readyToSign(lines: readonly LineForm[]): boolean {
  return lines.length > 0 && lines.every(saysHowToTake) && linesOf(lines) !== null;
}

/** How the screen names a medicine: brand, strength and form. */
export function medicineLabel(medicine: MedicineChoice): string {
  return [medicine.brandName, medicine.strength, medicine.form]
    .filter((part) => part !== null && part !== '')
    .join(' ');
}

/** A list label in the screen's language, the other one when it is missing. */
export function termLabel(term: PrescribingTermChoice, locale: Locale): string {
  const preferred = locale === 'bn-BD' ? term.labelBn : term.labelEn;
  return preferred ?? term.labelEn ?? term.labelBn ?? '';
}
