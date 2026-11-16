// Catalog keys of the consultation note's sections and allergy choices (T-CLI-02; FR-CLI-007),
// shared by the draft editor and the signed view. Full catalog keys as literals, so the unused-key
// check can see them.
import type { NoteSection } from '@hms/contracts';
import type { AllergyStatus } from './note-form';

export const SECTION_LABEL: Record<NoteSection, `note.section.${NoteSection}`> = {
  complaint: 'note.section.complaint',
  history: 'note.section.history',
  examination: 'note.section.examination',
  assessment: 'note.section.assessment',
  advice: 'note.section.advice',
};

export const ALLERGY_LABEL: Record<AllergyStatus, `note.allergy.${AllergyStatus}`> = {
  KNOWN_ALLERGIES: 'note.allergy.KNOWN_ALLERGIES',
  NO_KNOWN_ALLERGIES: 'note.allergy.NO_KNOWN_ALLERGIES',
  NOT_ASKED: 'note.allergy.NOT_ASKED',
};
