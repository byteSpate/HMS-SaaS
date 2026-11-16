'use client';
// Start an amendment of the signed note (T-CLI-02; UC-CLI-02; FR-CLI-003). The reason is
// mandatory; the amendment starts as a draft from the latest signed version and signs as the next
// version, linked to it. The earlier versions stay as they were signed.
import { Alert, Button, Dialog, Field, TextArea } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { consultationNotesApi, noteQueryKey } from '../../api/consultation-notes';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';

/** The API's rule: at least three characters (amendNoteRequestSchema). */
const MIN_REASON = 3;

export function AmendDialog({
  consultationId,
  version,
  onOpenChange,
}: {
  consultationId: string;
  /** The note's version the screen shows (SP-03). */
  version: number;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const amend = useMutation({
    mutationFn: () =>
      consultationNotesApi.amend(
        consultationId,
        { reason: reason.trim(), expectedVersion: version },
        idempotencyKey,
      ),
    onSuccess: (note) => {
      queryClient.setQueryData(noteQueryKey(consultationId), note);
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('note.amendTitle')}
      description={t('note.amendBody')}
      footer={
        <Button
          loading={amend.isPending}
          disabled={reason.trim().length < MIN_REASON}
          onClick={() => amend.mutate()}
        >
          {t('note.amendSubmit')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {amend.error ? <Alert tone="danger">{errorMessage(amend.error)}</Alert> : null}
        <Field label={t('note.amendReason')} required>
          {({ id, ...aria }) => (
            <TextArea
              id={id}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
