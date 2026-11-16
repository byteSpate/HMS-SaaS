// Consultation note contracts (T-CLI-02; FR-CLI-003, FR-CLI-007; UC-CLI-01 steps 2 and 5, C1;
// UC-CLI-02; C-029, FPR-06). Q-066 interim: free-text sections and the allergy tri-state, no
// coded diagnosis. The doctor's draft autosaves; signing makes an immutable version (v1); an
// amendment starts a new draft with a reason that signs as the next version, linked to the one it
// amends. Earlier versions stay readable. Absence of allergy data is never "no allergies".
import { z } from 'zod';

export const NOTE_SECTIONS = [
  'complaint',
  'history',
  'examination',
  'assessment',
  'advice',
] as const;
export type NoteSection = (typeof NOTE_SECTIONS)[number];

export const NOTE_SECTION_MAX = 4000;
const section = z.string().max(NOTE_SECTION_MAX).nullable();

/** FR-CLI-007: known allergies (a list), no known allergies, or not asked. */
export const allergiesSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('KNOWN_ALLERGIES'),
    items: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  }),
  z.strictObject({ status: z.literal('NO_KNOWN_ALLERGIES') }),
  z.strictObject({ status: z.literal('NOT_ASKED') }),
]);
export type Allergies = z.infer<typeof allergiesSchema>;

export const noteContentSchema = z.strictObject({
  complaint: section,
  history: section,
  examination: section,
  assessment: section,
  advice: section,
  allergies: allergiesSchema,
});
export type NoteContent = z.infer<typeof noteContentSchema>;

/** The note's version the screen holds (SP-03); 0 while the consultation has no note yet. */
const expectedVersion = z.number().int().min(0);

export const saveNoteDraftRequestSchema = z.strictObject({
  content: noteContentSchema,
  expectedVersion,
});
export type SaveNoteDraftRequest = z.infer<typeof saveNoteDraftRequestSchema>;

export const noteVersionRequestSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
});
export type NoteVersionRequest = z.infer<typeof noteVersionRequestSchema>;

/** UC-CLI-02: the reason is mandatory. */
export const amendNoteRequestSchema = z.strictObject({
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().min(1),
});
export type AmendNoteRequest = z.infer<typeof amendNoteRequestSchema>;

export const signedNoteVersionSchema = z.strictObject({
  versionNo: z.number().int().min(1),
  content: noteContentSchema,
  signedAt: z.iso.datetime(),
  /** The signing doctor's display name. */
  signedBy: z.string(),
  /** Null for v1; the amendment's reason for later versions. */
  amendReason: z.string().nullable(),
});
export type SignedNoteVersion = z.infer<typeof signedNoteVersionSchema>;

export const noteStatusSchema = z.enum(['NONE', 'DRAFT', 'SIGNED']);
export type NoteStatus = z.infer<typeof noteStatusSchema>;

export const consultationNoteSchema = z.strictObject({
  consultationId: z.uuid(),
  /** NONE: nothing written yet; DRAFT: an unsigned draft (first or amendment); SIGNED. */
  status: noteStatusSchema,
  draft: noteContentSchema.nullable(),
  draftSavedAt: z.iso.datetime().nullable(),
  /** Set while an amendment is being drafted. */
  amendReason: z.string().nullable(),
  /** Signed versions, newest first. */
  versions: z.array(signedNoteVersionSchema),
  /** The note's version for the next command; 0 while there is no note. */
  version: z.number().int().min(0),
});
export type ConsultationNote = z.infer<typeof consultationNoteSchema>;
