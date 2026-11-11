'use client';
// Check in a booked appointment (T-VIS-01; UC-VIS-01; FR-VIS-002, FR-SCH-004, FR-BIL-010; C-035,
// C-041; SP-08). The receptionist confirms that the patient has arrived; the server creates the
// visit, gives the serial number and issues the doctor-fee invoice in one step. The dialog then
// shows the serial number and the fee due, or that no fee is set for the doctor (A1). One
// Idempotency-Key per dialog, so a double click or a retry after a timeout is one visit (R1).
import type { Appointment, VisitCheckIn } from '@hms/contracts';
import { formatMoney, toLocaleDigits, type Locale } from '@hms/i18n';
import { Alert, Button, Dialog, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { wasRefused } from '../../api/errors';
import { SCHEDULE_SESSIONS_QUERY_KEY } from '../../api/schedule-sessions';
import { visitsApi } from '../../api/visits';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';

function CheckedIn({ visit }: { visit: VisitCheckIn }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const fee = visit.doctorFee;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 rounded-panel border border-border p-4">
        <p className="text-sm text-text-muted">{t('checkIn.serial')}</p>
        <p className="text-4xl font-semibold tabular-nums">
          {toLocaleDigits(String(visit.queueNumber), locale)}
        </p>
      </div>
      {fee.status === 'ISSUED' ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            {t('checkIn.invoice', { number: fee.invoice.number })}
            {' - '}
            {fee.followUp ? t('checkIn.followUpFee') : t('checkIn.newPatientFee')}
          </p>
          <p className="text-base font-semibold">
            {t('checkIn.due', {
              amount: formatMoney(fee.invoice.balance, locale, { symbol: 'sign' }),
            })}
          </p>
        </div>
      ) : (
        <Alert tone="warning">{t('checkIn.feeMissing')}</Alert>
      )}
    </div>
  );
}

export function CheckInDialog({
  appointment,
  description,
  onOpenChange,
}: {
  appointment: Appointment;
  /** Who and when, as the table shows it. */
  description: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const checkIn = useMutation({
    mutationFn: () =>
      visitsApi.checkIn(
        { appointmentId: appointment.appointmentId, expectedVersion: appointment.version },
        idempotencyKey,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULE_SESSIONS_QUERY_KEY });
      toast.show({ title: t('checkIn.done'), tone: 'success' });
    },
    onError: (error) => {
      // A refusal checked nothing in; after a timeout the same key returns the same visit.
      if (wasRefused(error)) setIdempotencyKey(crypto.randomUUID());
    },
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={checkIn.data ? t('checkIn.doneTitle') : t('checkIn.title')}
      description={checkIn.data ? description : t('checkIn.hint')}
      footer={
        checkIn.data ? (
          <Button onClick={() => onOpenChange(false)}>{t('common.close')}</Button>
        ) : (
          <Button loading={checkIn.isPending} onClick={() => checkIn.mutate()}>
            {t('checkIn.confirm')}
          </Button>
        )
      }
    >
      {checkIn.data ? (
        <CheckedIn visit={checkIn.data} />
      ) : (
        <div className="flex flex-col gap-3">
          {checkIn.error ? <Alert tone="danger">{errorMessage(checkIn.error)}</Alert> : null}
          <p className="text-sm font-medium">{description}</p>
        </div>
      )}
    </Dialog>
  );
}
