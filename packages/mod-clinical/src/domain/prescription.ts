// The prescription's rules (T-CLI-03; FR-CLI-001, FR-CLI-004..006; UC-CLI-01 steps 4 and 5;
// UC-CLI-02; C-012, FPR-06; Q-067 interim). Pure. The draft, sign, amend and discard rules are
// those of every clinical document; a line is kept with the medicine and the labels it was
// written with, and only active catalogue entries of the right kind may be chosen. A prescription
// signs with at least one line, each saying how to take the medicine.
import type {
  MedicineChoice,
  PrescribingTermChoice,
  PrescribingTermKind,
  PrescriptionContent,
  PrescriptionLine,
  PrescriptionLineInput,
  PrescriptionStatus,
} from '@hms/contracts';
import { fieldError } from '@hms/domain-kernel';
import { documentRules, type StoredDocumentState } from './clinical-document.js';

const rules = documentRules('prescription');

export const prescriptionStatusOf: (state: StoredDocumentState | null) => PrescriptionStatus =
  rules.statusOf;
export const assertCanSavePrescriptionDraft = rules.assertCanSaveDraft;
export const assertCanAmendPrescription = rules.assertCanAmend;
export const assertCanDiscardPrescription = rules.assertCanDiscard;

/** What the catalogue lookups found: active entries only, by ID. */
export interface CatalogueEntries {
  medicines: ReadonlyMap<string, MedicineChoice>;
  terms: ReadonlyMap<string, PrescribingTermChoice & { kind: PrescribingTermKind }>;
}

const TERM_FIELDS = [
  { field: 'routeTermId', kind: 'ROUTE', key: 'route' },
  { field: 'frequencyTermId', kind: 'FREQUENCY', key: 'frequency' },
  { field: 'durationTermId', kind: 'DURATION', key: 'duration' },
] as const;

/** The catalogue and list IDs the lines use, for the lookups. */
export function catalogueIdsOf(lines: readonly PrescriptionLineInput[]) {
  return {
    medicineIds: lines.map((line) => line.medicineId),
    termIds: lines.flatMap((line) =>
      TERM_FIELDS.flatMap(({ field }) => (line[field] ? [line[field]] : [])),
    ),
  };
}

/**
 * The lines as stored, each with the medicine and labels as they are now. An inactive or unknown
 * medicine or term, or a term of the wrong kind, is a field error on that line, so the doctor
 * sees which one to change. A line ID used twice is refused: lines keep their identity.
 */
export function keptLinesOf(
  inputs: readonly PrescriptionLineInput[],
  entries: CatalogueEntries,
): PrescriptionLine[] {
  const seen = new Set<string>();
  return inputs.map((input, index) => {
    if (seen.has(input.lineId)) {
      throw fieldError(`lines.${index}.lineId`, 'Each line needs its own ID');
    }
    seen.add(input.lineId);
    const medicine = entries.medicines.get(input.medicineId);
    if (!medicine) {
      throw fieldError(`lines.${index}.medicineId`, 'Choose an active medicine of this hospital');
    }
    const labels = Object.fromEntries(
      TERM_FIELDS.map(({ field, kind, key }) => {
        const termId = input[field];
        if (termId === null) return [key, null];
        const term = entries.terms.get(termId);
        if (term?.kind !== kind) {
          throw fieldError(`lines.${index}.${field}`, 'Choose an active entry of this list');
        }
        return [key, { termId: term.termId, labelBn: term.labelBn, labelEn: term.labelEn }];
      }),
    ) as Pick<PrescriptionLine, 'route' | 'frequency' | 'duration'>;
    return { ...input, medicine, ...labels };
  });
}

/** A line says how to take the medicine: a frequency, or instructions in either language. */
function saysHowToTake(line: PrescriptionLine): boolean {
  return line.frequency !== null || line.instructionsBn !== null || line.instructionsEn !== null;
}

/** UC-CLI-01 step 5: at least one line, each with a frequency or instructions. */
export function assertCanSignPrescription(
  state: StoredDocumentState | null,
  expectedVersion: number,
  draft: PrescriptionContent | null,
): void {
  rules.assertCanSignDraft(
    state && { ...state, hasDraft: state.hasDraft && draft !== null },
    expectedVersion,
  );
  if (!draft || draft.lines.length === 0) {
    throw fieldError('lines', 'Add at least one medicine before signing');
  }
  const unclear = draft.lines.findIndex((line) => !saysHowToTake(line));
  if (unclear >= 0) {
    throw fieldError(
      `lines.${unclear}.frequencyTermId`,
      'Say how often to take it, or add instructions',
    );
  }
}

/**
 * Signing checks the catalogue again: a medicine deactivated since the draft was saved (for
 * example withdrawn) must not be signed; the doctor chooses another.
 */
export function assertStillActive(
  draft: PrescriptionContent,
  activeMedicineIds: ReadonlySet<string>,
): void {
  const withdrawn = draft.lines.findIndex((line) => !activeMedicineIds.has(line.medicineId));
  if (withdrawn >= 0) {
    throw fieldError(`lines.${withdrawn}.medicineId`, 'This medicine is no longer active');
  }
}

/** FR-CLI-006: the lines the hospital pharmacy supplies; EXTERNAL lines never reach it. */
export function pharmacyLineCount(content: PrescriptionContent): number {
  return content.lines.filter((line) => line.fulfilment === 'HOSPITAL_PHARMACY').length;
}
