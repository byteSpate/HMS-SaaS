'use client';
// Book or reschedule an appointment (T-SCH-02; UC-SCH-01/02; FR-SCH-002, FR-SCH-003; C-035). The
// open sessions of one week are listed with the places left; a full session cannot be chosen.
// If the last place goes to someone else first, the API answers CAPACITY_FULL and the dialog says
// so and refreshes the list. Rescheduling moves the booking in one step on the server. Changing
// the week clears the choice, so Book never sends a session that is no longer on screen.
import type { Appointment, ScheduleSession } from '@hms/contracts';
import { formatDate, toLocaleDigits, type Locale } from '@hms/i18n';
import { Alert, Button, Dialog, Field, Radio, Skeleton, TextInput, useToast } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { APPOINTMENTS_QUERY_KEY, appointmentsApi } from '../../api/appointments';
import { wasRefused } from '../../api/errors';
import { SCHEDULE_SESSIONS_QUERY_KEY } from '../../api/schedule-sessions';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { addDays, hospitalToday } from '../schedules/session-form';
import { isCapacityFull, placesLeft } from './appointment-rules';

const doctorOf = (session: ScheduleSession) =>
  session.practitioner.nameEn ?? session.practitioner.nameBn ?? '';

export function BookDialog({
  patientId,
  rescheduling,
  onOpenChange,
}: {
  patientId: string;
  /** The booking to move; absent for a new booking. */
  rescheduling?: Appointment;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => hospitalToday(new Date()));
  const [sessionId, setSessionId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const sessions = useQuery({
    queryKey: [...SCHEDULE_SESSIONS_QUERY_KEY, 'bookable', weekStart],
    queryFn: () => appointmentsApi.bookableSessions(weekStart, addDays(weekStart, 6)),
  });
  const choices = (sessions.data ?? []).filter(
    (session) => session.sessionId !== rescheduling?.session.sessionId,
  );
  const showWeek = (start: string) => {
    setWeekStart(start);
    setSessionId('');
  };

  const save = useMutation({
    mutationFn: () =>
      rescheduling
        ? appointmentsApi.reschedule(
            rescheduling.appointmentId,
            sessionId,
            rescheduling.version,
            idempotencyKey,
          )
        : appointmentsApi.book({ patientId, sessionId }, idempotencyKey),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: SCHEDULE_SESSIONS_QUERY_KEY });
      const title = rescheduling ? t('appointments.rescheduled') : t('appointments.booked');
      toast.show({ title, tone: 'success' });
      onOpenChange(false);
    },
    onError: async (error) => {
      // A refused request booked nothing, so trying again is a new request with a new key. After
      // a timeout the booking may exist: the same key lets the server replay it, not book twice.
      if (wasRefused(error)) setIdempotencyKey(crypto.randomUUID());
      if (isCapacityFull(error)) {
        setSessionId('');
        await sessions.refetch();
      }
    },
  });

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={rescheduling ? t('appointments.rescheduleTitle') : t('appointments.bookTitle')}
      description={t('appointments.bookHint')}
      footer={
        <Button loading={save.isPending} disabled={sessionId === ''} onClick={() => save.mutate()}>
          {rescheduling ? t('appointments.confirmReschedule') : t('appointments.confirmBook')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('schedules.weekStarting')}>
            {({ id, ...aria }) => (
              <TextInput
                id={id}
                type="date"
                value={weekStart}
                onChange={(event) => {
                  if (event.target.value) showWeek(event.target.value);
                }}
                {...aria}
              />
            )}
          </Field>
          <Button variant="secondary" onClick={() => showWeek(addDays(weekStart, -7))}>
            {t('schedules.previousWeek')}
          </Button>
          <Button variant="secondary" onClick={() => showWeek(addDays(weekStart, 7))}>
            {t('schedules.nextWeek')}
          </Button>
        </div>
        {sessions.error ? <Alert tone="danger">{errorMessage(sessions.error)}</Alert> : null}
        {sessions.isPending ? <Skeleton className="h-24" /> : null}
        {sessions.data && choices.length === 0 ? (
          <p className="text-sm text-text-muted">{t('appointments.noSessions')}</p>
        ) : null}
        {choices.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t('appointments.columnSession')}</legend>
            {choices.map((session) => {
              const left = placesLeft(session);
              const time = toLocaleDigits(`${session.startTime}-${session.endTime}`, locale);
              return (
                <Radio
                  key={session.sessionId}
                  className="rounded-control border border-border p-3"
                  name="session"
                  value={session.sessionId}
                  checked={sessionId === session.sessionId}
                  disabled={left === 0}
                  onChange={() => {
                    save.reset();
                    setSessionId(session.sessionId);
                  }}
                  label={
                    <span className="flex flex-col">
                      <span className="font-medium">
                        {formatDate(session.startsAt, locale)} {time} {doctorOf(session)}
                      </span>
                      <span className="text-sm text-text-muted">
                        {left === 0
                          ? t('appointments.full')
                          : t('appointments.placesLeft', { count: left })}
                      </span>
                    </span>
                  }
                />
              );
            })}
          </fieldset>
        ) : null}
      </div>
    </Dialog>
  );
}
