'use client';
// Appointments as a table (T-SCH-02; FR-SCH-002..005): on the patient record by session, in a
// session's patient list by patient. Offers what the rules allow: reschedule and cancel before the
// session ends, no-show after it (FR-SCH-005), and check-in on the session date to staff with
// visit.checkin (T-VIS-01). A cancellation shows its reason.
import type { Appointment } from '@hms/contracts';
import { formatDate, toLocaleDigits, type Locale } from '@hms/i18n';
import { Alert, Button, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { appointmentsApi } from '../../api/appointments';
import { ApiError } from '../../api/errors';
import { SCHEDULE_SESSIONS_QUERY_KEY } from '../../api/schedule-sessions';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { useCachedSession } from '../../session/use-session';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, TABLE, TABLE_FRAME } from '../admin/admin-table';
import { canChange, canCheckIn, canMarkNoShow } from './appointment-rules';
import { AppointmentStatusBadge } from './appointment-status';
import { BookDialog } from './book-dialog';
import { CancelDialog } from './cancel-dialog';
import { CheckInDialog } from './check-in-dialog';

const doctorOf = (appointment: Appointment) =>
  appointment.session.practitioner.nameEn ?? appointment.session.practitioner.nameBn ?? '';
const patientOf = (appointment: Appointment) =>
  appointment.patient.nameEn ?? appointment.patient.nameBn ?? appointment.patient.mrn;

type Open =
  | { kind: 'cancel' | 'reschedule'; appointment: Appointment }
  | { kind: 'checkIn'; appointment: Appointment; description: string }
  | null;

export function AppointmentTable({
  appointments,
  by,
}: {
  appointments: Appointment[];
  /** 'session': the patient record (one patient); 'patient': one session's list. */
  by: 'session' | 'patient';
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Open>(null);
  const mayCheckIn = useCachedSession()?.permissions.includes('visit.checkin') ?? false;
  const now = new Date();
  const close = (isOpen: boolean) => {
    if (!isOpen) setOpen(null);
  };

  const noShow = useMutation({
    mutationFn: (appointment: Appointment) =>
      appointmentsApi.markNoShow(
        appointment.appointmentId,
        appointment.version,
        crypto.randomUUID(),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SCHEDULE_SESSIONS_QUERY_KEY });
      toast.show({ title: t('appointments.noShowDone'), tone: 'success' });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'STALE_RECORD') {
        await queryClient.invalidateQueries({ queryKey: SCHEDULE_SESSIONS_QUERY_KEY });
      }
    },
  });

  return (
    <>
      {noShow.error ? <Alert tone="danger">{errorMessage(noShow.error)}</Alert> : null}
      <div className={TABLE_FRAME}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th scope="col" className={`${HEAD_CELL} text-start`}>
                {by === 'session'
                  ? t('appointments.columnSession')
                  : t('appointments.columnPatient')}
              </th>
              <th scope="col" className={`${HEAD_CELL} text-start`}>
                {t('appointments.columnStatus')}
              </th>
              <th scope="col" className={`${HEAD_CELL} text-end`}>
                {t('appointments.columnActions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => {
              const { session } = appointment;
              const time = toLocaleDigits(`${session.startTime}-${session.endTime}`, locale);
              const which =
                by === 'session'
                  ? `${formatDate(session.startsAt, locale)} ${time} ${doctorOf(appointment)}`
                  : `${patientOf(appointment)} (${appointment.patient.mrn})`;
              return (
                <tr key={appointment.appointmentId} className={ROW}>
                  <td className={CELL}>
                    <p className={ROW_TITLE}>{which}</p>
                    {appointment.cancelReason ? (
                      <p className="text-[0.6875rem] text-text-muted">
                        {t('appointments.reasonShown', { reason: appointment.cancelReason })}
                      </p>
                    ) : null}
                  </td>
                  <td className={CELL}>
                    <AppointmentStatusBadge status={appointment.status} />
                  </td>
                  <td className={`${CELL} text-end`}>
                    <div className="flex justify-end gap-2">
                      {mayCheckIn && canCheckIn(appointment, now) ? (
                        <Button
                          aria-label={`${t('checkIn.button')}: ${which}`}
                          onClick={() =>
                            setOpen({ kind: 'checkIn', appointment, description: which })
                          }
                        >
                          {t('checkIn.button')}
                        </Button>
                      ) : null}
                      {by === 'session' && canChange(appointment, now) ? (
                        <Button
                          variant="secondary"
                          aria-label={`${t('appointments.reschedule')}: ${which}`}
                          onClick={() => setOpen({ kind: 'reschedule', appointment })}
                        >
                          {t('appointments.reschedule')}
                        </Button>
                      ) : null}
                      {canChange(appointment, now) ? (
                        <Button
                          variant="secondary"
                          aria-label={`${t('appointments.cancel')}: ${which}`}
                          onClick={() => setOpen({ kind: 'cancel', appointment })}
                        >
                          {t('appointments.cancel')}
                        </Button>
                      ) : null}
                      {canMarkNoShow(appointment, now) ? (
                        <Button
                          variant="secondary"
                          loading={noShow.isPending && noShow.variables === appointment}
                          aria-label={`${t('appointments.noShow')}: ${which}`}
                          onClick={() => noShow.mutate(appointment)}
                        >
                          {t('appointments.noShow')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open?.kind === 'cancel' ? (
        <CancelDialog appointment={open.appointment} onOpenChange={close} />
      ) : null}
      {open?.kind === 'checkIn' ? (
        <CheckInDialog
          appointment={open.appointment}
          description={open.description}
          onOpenChange={close}
        />
      ) : null}
      {open?.kind === 'reschedule' ? (
        <BookDialog
          patientId={open.appointment.patient.patientId}
          rescheduling={open.appointment}
          onOpenChange={close}
        />
      ) : null}
    </>
  );
}
