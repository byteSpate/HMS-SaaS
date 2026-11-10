'use client';
// Schedules (T-SCH-01; FR-SCH-002; C-035; SCR-04): the doctor sessions of one week, in time order.
// Add a session as a draft, publish it so it takes bookings, or cancel one that has none. The week
// starts on the hospital's today and moves by seven days. scheduling.schedule.manage; the API
// enforces it.
import type { ScheduleSession, ScheduleSessionStatus } from '@hms/contracts';
import { formatDate, toLocaleDigits, type Locale } from '@hms/i18n';
import {
  Alert,
  Button,
  Dialog,
  Field,
  PageLayout,
  Skeleton,
  StatusBadge,
  TextInput,
  useToast,
  type StatusBadgeProps,
} from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../../../src/api/errors';
import {
  SCHEDULE_SESSIONS_QUERY_KEY,
  scheduleSessionsApi,
} from '../../../src/api/schedule-sessions';
import {
  CELL,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../src/components/admin/admin-table';
import { SessionDialog } from '../../../src/components/schedules/session-dialog';
import { addDays, hospitalToday } from '../../../src/components/schedules/session-form';
import { useApiErrorMessage } from '../../../src/i18n/use-api-error-message';

// Full catalog keys as literals, so the unused-key check can see them.
const STATUS: Record<
  ScheduleSessionStatus,
  { labelKey: `schedules.status${ScheduleSessionStatus}`; badge: StatusBadgeProps['status'] }
> = {
  DRAFT: { labelKey: 'schedules.statusDRAFT', badge: 'review' },
  PUBLISHED: { labelKey: 'schedules.statusPUBLISHED', badge: 'active' },
  CANCELLED: { labelKey: 'schedules.statusCANCELLED', badge: 'idle' },
};

const doctorOf = (session: ScheduleSession) =>
  session.practitioner.nameEn ?? session.practitioner.nameBn ?? '';

type Change = { session: ScheduleSession; action: 'publish' | 'cancel' };

export default function SchedulesPage() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => hospitalToday(new Date()));
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<ScheduleSession | null>(null);
  const weekEnd = addDays(weekStart, 6);
  const sessions = useQuery({
    queryKey: [...SCHEDULE_SESSIONS_QUERY_KEY, weekStart],
    queryFn: () => scheduleSessionsApi.list(weekStart, weekEnd),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: SCHEDULE_SESSIONS_QUERY_KEY });

  const change = useMutation({
    mutationFn: ({ session, action }: Change) =>
      scheduleSessionsApi.change(session.sessionId, action, session.version, crypto.randomUUID()),
    onSuccess: async (_saved, { action }) => {
      await refresh();
      const title = action === 'publish' ? t('schedules.published') : t('schedules.cancelled');
      toast.show({ title, tone: 'success' });
      setCancelling(null);
    },
    onError: async (error) => {
      // SP-03: someone else changed the session; show the current list instead of the old one.
      if (error instanceof ApiError && error.code === 'STALE_RECORD') {
        await refresh();
        toast.show({ title: t('schedules.staleNotice'), tone: 'warning' });
        setCancelling(null);
      }
    },
  });
  const changeError =
    change.error instanceof ApiError && change.error.code === 'STALE_RECORD' ? null : change.error;

  return (
    <PageLayout
      title={t('schedules.title')}
      description={t('schedules.description')}
      actions={<Button onClick={() => setAdding(true)}>{t('schedules.add')}</Button>}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('schedules.weekStarting')}>
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              type="date"
              value={weekStart}
              onChange={(event) => {
                if (event.target.value) setWeekStart(event.target.value);
              }}
              {...aria}
            />
          )}
        </Field>
        <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          {t('schedules.previousWeek')}
        </Button>
        <Button variant="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          {t('schedules.nextWeek')}
        </Button>
      </div>
      {sessions.error ? <Alert tone="danger">{errorMessage(sessions.error)}</Alert> : null}
      {changeError && !cancelling ? <Alert tone="danger">{errorMessage(changeError)}</Alert> : null}
      {sessions.isPending ? <Skeleton className="h-40" /> : null}
      {sessions.data?.length === 0 ? (
        <p className="text-sm text-text-muted">{t('schedules.empty')}</p>
      ) : null}
      {sessions.data && sessions.data.length > 0 ? (
        <div className={TABLE_FRAME}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('schedules.columnDate')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('schedules.columnTime')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('schedules.columnPractitioner')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('schedules.columnBookings')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('schedules.columnStatus')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-end`}>
                  {t('schedules.columnActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.map((session) => {
                const status = STATUS[session.status];
                const time = toLocaleDigits(`${session.startTime}-${session.endTime}`, locale);
                const which = `${doctorOf(session)} ${time}`;
                const busy = change.isPending && change.variables.session === session;
                return (
                  <tr key={session.sessionId} className={ROW}>
                    <td className={CELL}>{formatDate(session.startsAt, locale)}</td>
                    <td className={`${CELL} tabular-nums`}>{time}</td>
                    <td className={CELL}>
                      <p className={ROW_TITLE}>{doctorOf(session)}</p>
                      {session.practitioner.specialty ? (
                        <p className="text-[0.6875rem] text-text-muted">
                          {session.practitioner.specialty}
                        </p>
                      ) : null}
                    </td>
                    <td className={`${CELL} tabular-nums`}>
                      {t('schedules.bookings', {
                        booked: session.bookedCount,
                        capacity: session.capacity,
                      })}
                    </td>
                    <td className={CELL}>
                      <StatusBadge size="sm" status={status.badge} label={t(status.labelKey)} />
                    </td>
                    <td className={`${CELL} text-end`}>
                      <div className="flex justify-end gap-2">
                        {session.status === 'DRAFT' ? (
                          <Button
                            loading={busy && change.variables.action === 'publish'}
                            aria-label={`${t('schedules.publish')}: ${which}`}
                            onClick={() => change.mutate({ session, action: 'publish' })}
                          >
                            {t('schedules.publish')}
                          </Button>
                        ) : null}
                        {session.status !== 'CANCELLED' && session.bookedCount === 0 ? (
                          <Button
                            variant="secondary"
                            aria-label={`${t('schedules.cancel')}: ${which}`}
                            onClick={() => {
                              change.reset();
                              setCancelling(session);
                            }}
                          >
                            {t('schedules.cancel')}
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
      ) : null}
      {adding ? (
        <SessionDialog sessionDate={weekStart} onOpenChange={(open) => setAdding(open)} />
      ) : null}
      {cancelling ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setCancelling(null);
          }}
          closeLabel={t('common.close')}
          title={t('schedules.cancelTitle')}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCancelling(null)}>
                {t('schedules.keep')}
              </Button>
              <Button
                variant="danger"
                loading={change.isPending}
                onClick={() => change.mutate({ session: cancelling, action: 'cancel' })}
              >
                {t('schedules.cancelConfirm')}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm">{t('schedules.cancelBody')}</p>
            {changeError ? <Alert tone="danger">{errorMessage(changeError)}</Alert> : null}
          </div>
        </Dialog>
      ) : null}
    </PageLayout>
  );
}
