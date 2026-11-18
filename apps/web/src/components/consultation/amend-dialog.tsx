'use client';
// Start an amendment of a signed clinical document (T-CLI-02 note, T-CLI-03 prescription;
// UC-CLI-02; FR-CLI-003). The reason is mandatory; the amendment starts as a draft from the latest
// signed version and signs as the next version, linked to it. The earlier versions stay as they
// were signed. The caller passes the document's texts and the request that starts it.
import { Alert, Button, Dialog, Field, TextArea } from '@hms/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';

/** The API's rule: at least three characters (amend request schemas). */
const MIN_REASON = 3;

export function AmendDialog({
  texts,
  onAmend,
  onOpenChange,
}: {
  /** Already translated. */
  texts: { title: string; body: string; reason: string; submit: string };
  /** Starts the amendment with the reason and an Idempotency-Key kept across retries. */
  onAmend: (reason: string, idempotencyKey: string) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const [reason, setReason] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const amend = useMutation({
    mutationFn: () => onAmend(reason.trim(), idempotencyKey),
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={texts.title}
      description={texts.body}
      footer={
        <Button
          loading={amend.isPending}
          disabled={reason.trim().length < MIN_REASON}
          onClick={() => amend.mutate()}
        >
          {texts.submit}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {amend.error ? <Alert tone="danger">{errorMessage(amend.error)}</Alert> : null}
        <Field label={texts.reason} required>
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
