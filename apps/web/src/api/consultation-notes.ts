// Consultation note endpoints (T-CLI-02; FR-CLI-003; UC-CLI-01 steps 2 and 5; UC-CLI-02). Every
// command carries the note's version (SP-03) and an Idempotency-Key (SP-08); every answer is the
// whole note, checked against the shared contract.
import {
  consultationNoteSchema,
  type AmendNoteRequest,
  type NoteVersionRequest,
  type SaveNoteDraftRequest,
} from '@hms/contracts';
import { apiRequest } from './client';

export const noteQueryKey = (consultationId: string) =>
  ['consultations', consultationId, 'note'] as const;

const path = (consultationId: string, action = '') =>
  `/consultations/${consultationId}/note${action}`;
const parse = (data: unknown) => consultationNoteSchema.parse(data);
const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export const consultationNotesApi = {
  read: (consultationId: string) => apiRequest(path(consultationId), { parse }),
  saveDraft: (consultationId: string, body: SaveNoteDraftRequest, key: string) =>
    apiRequest(path(consultationId, '/draft'), {
      method: 'PUT',
      body,
      headers: idempotent(key),
      parse,
    }),
  sign: (consultationId: string, body: NoteVersionRequest, key: string) =>
    apiRequest(path(consultationId, '/sign'), {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse,
    }),
  amend: (consultationId: string, body: AmendNoteRequest, key: string) =>
    apiRequest(path(consultationId, '/amend'), {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse,
    }),
  discard: (consultationId: string, body: NoteVersionRequest, key: string) =>
    apiRequest(path(consultationId, '/discard'), {
      method: 'POST',
      body,
      headers: idempotent(key),
      parse,
    }),
};
