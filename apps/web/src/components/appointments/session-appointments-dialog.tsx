'use client';
// The patients booked into one session (T-SCH-02; FR-SCH-002..005), opened from the schedules
// page: in booking order, with cancel before the session ends and no-show after it.
import type { ScheduleSession } from '@hms/contracts';
import { Alert, Dialog, Skeleton } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { APPOINTMENTS_QUERY_KEY, appointmentsApi } from '../../api/appointments';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { AppointmentTable } from './appointment-table';

export function SessionAppointmentsDialog({
  session,
  description,
  onOpenChange,
}: {
  session: ScheduleSession;
  /** Which session, as the schedules list shows it. */
  description: string;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const appointments = useQuery({
    queryKey: [...APPOINTMENTS_QUERY_KEY, 'session', session.sessionId],
    queryFn: () => appointmentsApi.ofSession(session.sessionId),
  });

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('appointments.patientsTitle')}
      description={description}
    >
      <div className="flex flex-col gap-3">
        {appointments.error ? (
          <Alert tone="danger">{errorMessage(appointments.error)}</Alert>
        ) : null}
        {appointments.isPending ? <Skeleton className="h-24" /> : null}
        {appointments.data?.length === 0 ? (
          <p className="text-sm text-text-muted">{t('appointments.patientsEmpty')}</p>
        ) : null}
        {appointments.data && appointments.data.length > 0 ? (
          <AppointmentTable appointments={appointments.data} by="patient" />
        ) : null}
      </div>
    </Dialog>
  );
}
