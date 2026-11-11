'use client';
// Cancel an appointment with a reason (T-SCH-02; FR-SCH-002; AT-SCH-005). The record stays with
// the reason and who cancelled it; the place is freed. A stale version reloads the lists.
import type { Appointment } from '@hms/contracts';
import { Alert, Button, Dialog, Field, TextArea, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { APPOINTMENTS_QUERY_KEY, appointmentsApi } from '../../api/appointments';
import { ApiError } from '../../api/errors';
import { SCHEDULE_SESSIONS_QUERY_KEY } from '../../api/schedule-sessions';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { hasCancelReason } from './appointment-rules';

export function CancelDialog({
  appointment,
  onOpenChange,
}: {
  appointment: Appointment;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const refresh = () => queryClient.invalidateQueries({ queryKey: SCHEDULE_SESSIONS_QUERY_KEY });

  const cancel = useMutation({
    mutationFn: () =>
      appointmentsApi.cancel(
        appointment.appointmentId,
        reason.trim(),
        appointment.version,
        idempotencyKey,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEY });
      await refresh();
      toast.show({ title: t('appointments.cancelled'), tone: 'success' });
      onOpenChange(false);
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'STALE_RECORD') {
        await refresh();
        toast.show({ title: t('appointments.staleNotice'), tone: 'warning' });
        onOpenChange(false);
      }
    },
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('appointments.cancelTitle')}
      description={t('appointments.cancelBody')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('appointments.keep')}
          </Button>
          <Button
            variant="danger"
            loading={cancel.isPending}
            disabled={!hasCancelReason(reason)}
            onClick={() => cancel.mutate()}
          >
            {t('appointments.cancelConfirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {cancel.error ? <Alert tone="danger">{errorMessage(cancel.error)}</Alert> : null}
        <Field
          label={t('appointments.cancelReason')}
          hint={t('appointments.cancelReasonHint')}
          required
        >
          {({ id, required, ...aria }) => (
            <TextArea
              id={id}
              required={required}
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
