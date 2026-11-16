// The consultation note form's state and the content it saves (T-CLI-02; FR-CLI-003, FR-CLI-007;
// Q-066 interim: free-text sections and the allergy tri-state). Pure, so the rules are tested
// without rendering: a blank section is saved as null, known allergies are typed one per line
// (or comma-separated), and an empty form means "not asked", never "no known allergies".
import { NOTE_SECTIONS, type Allergies, type NoteContent, type NoteSection } from '@hms/contracts';

export type AllergyStatus = Allergies['status'];

export type NoteForm = Record<NoteSection, string> & {
  allergyStatus: AllergyStatus;
  allergyItems: string;
};

export function formOf(content: NoteContent | null): NoteForm {
  const sections = Object.fromEntries(
    NOTE_SECTIONS.map((section) => [section, content?.[section] ?? '']),
  ) as Record<NoteSection, string>;
  const allergies = content?.allergies ?? { status: 'NOT_ASKED' };
  return {
    ...sections,
    allergyStatus: allergies.status,
    allergyItems: allergies.status === 'KNOWN_ALLERGIES' ? allergies.items.join('\n') : '',
  };
}

export function allergyItemsOf(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** The content to save; null while known allergies are chosen but none is listed. */
export function contentOf(form: NoteForm): NoteContent | null {
  let allergies: Allergies;
  if (form.allergyStatus === 'KNOWN_ALLERGIES') {
    const items = allergyItemsOf(form.allergyItems);
    if (items.length === 0) return null;
    allergies = { status: 'KNOWN_ALLERGIES', items };
  } else {
    allergies = { status: form.allergyStatus };
  }
  const sections = Object.fromEntries(
    NOTE_SECTIONS.map((section) => [section, form[section].trim() === '' ? null : form[section]]),
  ) as Record<NoteSection, string | null>;
  return { ...sections, allergies };
}

/** UC-CLI-01 step 5: a note is signed with at least one section written. */
export function hasWriting(form: NoteForm): boolean {
  return NOTE_SECTIONS.some((section) => form[section].trim().length > 0);
}

/** Autosave skips a form that matches what the server already holds. */
export function sameContent(a: NoteContent | null, b: NoteContent | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
