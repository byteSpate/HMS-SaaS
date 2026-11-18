// The prescribing term dialog's form state and the request it sends (T-CLI-03; Q-067 interim;
// FR-I18N-006). Pure, so the rules are tested without rendering. The kind is chosen when the term
// is added and never changes.
import type { PrescribingTermKind, PrescribingTermRecord } from '@hms/contracts';

export type TermForm = { labelBn: string; labelEn: string; sortOrder: string; active: boolean };

export function termFormOf(term?: PrescribingTermRecord): TermForm {
  return {
    labelBn: term?.labelBn ?? '',
    labelEn: term?.labelEn ?? '',
    sortOrder: String(term?.sortOrder ?? 0),
    active: term?.active ?? true,
  };
}

const optional = (text: string) => (text.trim() === '' ? null : text.trim());

/** The picker order as a whole number 0-9999, or null while the field holds something else. */
export function sortOrderOf(form: TermForm): number | null {
  const text = form.sortOrder.trim();
  if (!/^\d{1,4}$/.test(text)) return null;
  return Number(text);
}

export function termFieldsOf(form: TermForm) {
  return {
    labelBn: optional(form.labelBn),
    labelEn: optional(form.labelEn),
    sortOrder: sortOrderOf(form) ?? 0,
  };
}

/** FR-I18N-006: a label in Bangla or English, and a valid order. */
export function isTermComplete(form: TermForm): boolean {
  const fields = termFieldsOf(form);
  return (fields.labelBn !== null || fields.labelEn !== null) && sortOrderOf(form) !== null;
}

export function termDiffers(term: PrescribingTermRecord, form: TermForm): boolean {
  const fields = termFieldsOf(form);
  return (
    form.active !== term.active ||
    fields.labelBn !== term.labelBn ||
    fields.labelEn !== term.labelEn ||
    fields.sortOrder !== term.sortOrder
  );
}

/** The terms of one kind, in the doctor's picker order (active first in the admin list). */
export function termsOfKind(
  terms: readonly PrescribingTermRecord[],
  kind: PrescribingTermKind,
): PrescribingTermRecord[] {
  return terms
    .filter((term) => term.kind === kind)
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.sortOrder - b.sortOrder ||
        (a.labelEn ?? '').localeCompare(b.labelEn ?? ''),
    );
}
