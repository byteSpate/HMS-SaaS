'use client';
// The note part of the consultation screen (T-CLI-02; FR-CLI-003; UC-CLI-01 steps 2 and 5, R1;
// UC-CLI-02): reads the note, then shows the draft editor while nothing is signed or an
// amendment is open, and the signed view otherwise. The editor is keyed by the signed versions and
// the amendment, so signing or starting an amendment starts it fresh from the server's draft.
import { Alert, Skeleton } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { consultationNotesApi, noteQueryKey } from '../../api/consultation-notes';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { useCachedSession } from '../../session/use-session';
import { NoteEditor } from './note-editor';
import { NoteView } from './note-view';

export function NotePanel({ consultationId }: { consultationId: string }) {
  const errorMessage = useApiErrorMessage();
  const permissions = useCachedSession()?.permissions ?? [];
  const note = useQuery({
    queryKey: noteQueryKey(consultationId),
    queryFn: () => consultationNotesApi.read(consultationId),
  });

  if (note.error) return <Alert tone="danger">{errorMessage(note.error)}</Alert>;
  if (!note.data) return <Skeleton className="h-64" />;
  if (note.data.status === 'SIGNED') {
    return (
      <NoteView
        consultationId={consultationId}
        note={note.data}
        canAmend={permissions.includes('clinical.document.amend')}
      />
    );
  }
  return (
    <NoteEditor
      key={`${note.data.versions.length}:${note.data.amendReason ?? ''}`}
      consultationId={consultationId}
      note={note.data}
      canSign={permissions.includes('clinical.document.sign')}
    />
  );
}
