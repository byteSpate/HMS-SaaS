'use client';
// Finance reviews a closed cashier session (T-BIL-03; FR-BIL-026; UC-BIL-04 step 5, D2): the
// amounts per method, then Accept, with a note when there is a difference. A cashier who reviews
// their own session is refused by the API (SEGREGATION_OF_DUTY) and the message says why.
import type { CashierSession } from '@hms/contracts';
import { formatDateTime, type Locale } from '@hms/i18n';
import { Alert, Button, Dialog, Field, TextArea, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CASHIER_SESSION_QUERY_KEY, cashierSessionsApi } from '../../api/cashier-sessions';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { useIdempotencyKey } from './session-dialogs';
import { SessionTotals } from './session-totals';

export function ReviewSessionDialog({
  session,
  onOpenChange,
}: {
  session: CashierSession;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [key, renewKey] = useIdempotencyKey();
  const noteMissing = session.hasVariance && note.trim() === '';

  const review = useMutation({
    mutationFn: () =>
      cashierSessionsApi.review(
        session.sessionId,
        { expectedVersion: session.version, ...(note.trim() ? { note: note.trim() } : {}) },
        key,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CASHIER_SESSION_QUERY_KEY });
      toast.show({ title: t('cashierSessions.reviewed'), tone: 'success' });
      onOpenChange(false);
    },
    onError: renewKey,
  });

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('cashierSessions.reviewTitle')}
      description={t('cashierSessions.reviewHint')}
      footer={
        <Button loading={review.isPending} disabled={noteMissing} onClick={() => review.mutate()}>
          {t('cashierSessions.accept')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {review.error ? <Alert tone="danger">{errorMessage(review.error)}</Alert> : null}
        <p className="text-sm">
          <span className="font-medium">{session.cashier.displayName}</span>
          {' - '}
          {formatDateTime(session.openedAt, locale)}
          {session.closedAt ? ` - ${formatDateTime(session.closedAt, locale)}` : null}
        </p>
        <Alert tone={session.hasVariance ? 'warning' : 'success'}>
          {session.hasVariance ? t('cashier.unbalanced') : t('cashier.balanced')}
        </Alert>
        <SessionTotals totals={session.totals} />
        <Field
          label={t('cashierSessions.note')}
          hint={t('cashierSessions.noteHint')}
          error={noteMissing ? t('cashierSessions.noteRequired') : undefined}
        >
          {({ id, ...aria }) => (
            <TextArea
              id={id}
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              {...aria}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
