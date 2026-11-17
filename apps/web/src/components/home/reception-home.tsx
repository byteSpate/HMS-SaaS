'use client';
// The front desk's home (Role Home v2 design, role "reception"): today's sessions and bookings,
// who is waiting to pay, the doctor sessions of the day with where each stands, and the desk's
// quick actions. Each part reads only what the user may see (FR-ACC-009): sessions need
// scheduling.schedule.manage, the payment queue billing.payment.record. Implements: T-UI-03.
import type { CashierQueue, ScheduleSession } from '@hms/contracts';
import { formatMoney, type Locale } from '@hms/i18n';
import { buttonClassName, StatusBadge, type StatusKind, WorkPanel } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { INVOICES_QUERY_KEY, invoicesApi } from '../../api/invoices';
import { SCHEDULE_SESSIONS_QUERY_KEY, scheduleSessionsApi } from '../../api/schedule-sessions';
import { sumAmounts } from '../../money';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, PANEL_TABLE } from '../admin/admin-table';
import { displayName } from '../patients/patient-text';
import { QueryView } from '../query-view';
import { hospitalToday } from '../schedules/session-form';
import { queueBalances, receptionCounts, sessionPhase, type SessionPhase } from './home-rules';
import { HomeTile, TileRow, tileState, useDigits, ViewAllLink } from './home-parts';

// Full catalog keys as literals, so the unused-key check can see them.
const PHASE = {
  running: { labelKey: 'home.phaseRunning', badge: 'active' },
  upcoming: { labelKey: 'home.phaseUpcoming', badge: 'idle' },
  finished: { labelKey: 'home.phaseFinished', badge: 'done' },
  draft: { labelKey: 'home.phaseDraft', badge: 'review' },
  cancelled: { labelKey: 'home.phaseCancelled', badge: 'idle' },
} as const satisfies Record<SessionPhase, { labelKey: string; badge: StatusKind }>;

const doctorOf = (session: ScheduleSession) =>
  session.practitioner.nameEn ?? session.practitioner.nameBn ?? '';

/** Shared with the finance view: who still owes money today. */
export function useCashierQueue(enabled: boolean) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, 'queue'],
    queryFn: invoicesApi.queue,
    enabled,
  });
}

function SessionsTable({ sessions, now }: { sessions: ScheduleSession[]; now: Date }) {
  const t = useTranslations();
  const digits = useDigits();
  return (
    <table className={PANEL_TABLE}>
      <thead>
        <tr>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('home.colTime')}
          </th>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('home.colDoctor')}
          </th>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('home.colBooked')}
          </th>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('home.colStatus')}
          </th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => {
          const phase = PHASE[sessionPhase(session, now)];
          return (
            <tr key={session.sessionId} className={ROW}>
              <td className={`${CELL} tabular-nums`}>
                {digits(`${session.startTime}-${session.endTime}`)}
              </td>
              <td className={CELL} data-label={t('home.colDoctor')}>
                <span className={ROW_TITLE}>{doctorOf(session)}</span>
              </td>
              <td className={`${CELL} tabular-nums`} data-label={t('home.colBooked')}>
                {t('schedules.bookings', {
                  booked: session.bookedCount,
                  capacity: session.capacity,
                })}
              </td>
              <td className={CELL}>
                <StatusBadge size="sm" status={phase.badge} label={t(phase.labelKey)} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Patients who still owe, in the API's queue order. */
export function QueueList({ rows }: { rows: CashierQueue['patients'] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const money = (amount: string) => formatMoney(amount, locale, { symbol: 'sign' });
  return (
    <ul className="divide-y divide-border">
      {rows.slice(0, 6).map(({ patient, invoices }) => (
        <li key={patient.patientId} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
          <span className="text-sm font-medium">{displayName(patient)}</span>
          <span className="text-xs text-text-muted">{patient.mrn}</span>
          <span className="ms-auto text-sm tabular-nums">
            {t('cashier.due', {
              amount: money(sumAmounts(invoices.map((invoice) => invoice.balance))),
            })}
          </span>
        </li>
      ))}
    </ul>
  );
}

type SessionsQuery = ReturnType<typeof useTodaySessions>;
type QueueQuery = ReturnType<typeof useCashierQueue>;

function useTodaySessions(today: string, enabled: boolean) {
  return useQuery({
    queryKey: [...SCHEDULE_SESSIONS_QUERY_KEY, 'day', today],
    queryFn: () => scheduleSessionsApi.list(today, today),
    enabled,
  });
}

function SessionTiles({ sessions, now }: { sessions: SessionsQuery; now: Date }) {
  const t = useTranslations();
  const digits = useDigits();
  const counts = sessions.data ? receptionCounts(sessions.data, now) : null;
  return (
    <>
      <HomeTile
        label={t('home.kpiSessions')}
        value={counts ? digits(counts.sessions) : undefined}
        note={counts ? t('home.kpiSessionsNote', { running: digits(counts.running) }) : undefined}
        state={tileState(sessions)}
        href="/schedules"
      />
      <HomeTile
        label={t('home.kpiBooked')}
        value={counts ? digits(counts.booked) : undefined}
        note={t('home.kpiBookedNote')}
        state={tileState(sessions)}
        href="/schedules"
      />
    </>
  );
}

function QueueTile({ queue }: { queue: QueueQuery }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const digits = useDigits();
  const owed = queue.data
    ? formatMoney(sumAmounts(queueBalances(queue.data)), locale, { symbol: 'sign' })
    : '';
  return (
    <HomeTile
      label={t('home.kpiWaitingPay')}
      value={queue.data ? digits(queue.data.length) : undefined}
      note={queue.data ? t('home.kpiWaitingPayNote', { amount: owed }) : undefined}
      state={tileState(queue)}
      href="/cashier"
    />
  );
}

/** The desk's next steps, each shown only with the permission its screen needs. */
function QuickActions({ granted }: { granted: ReadonlySet<string> }) {
  const t = useTranslations();
  const actions = [
    { code: 'patient.record.search', href: '/patients', label: t('home.actionFindPatient') },
    { code: 'scheduling.schedule.manage', href: '/schedules', label: t('home.actionSchedules') },
    { code: 'billing.cashier_session.manage', href: '/cashier', label: t('home.actionCashier') },
  ].filter((action) => granted.has(action.code));
  return (
    <nav aria-label={t('home.quickActions')} className="flex flex-wrap gap-2">
      {actions.map((action, index) => (
        <Link
          key={action.href}
          href={action.href}
          className={buttonClassName(index === 0 ? 'primary' : 'secondary')}
        >
          {action.label}
        </Link>
      ))}
    </nav>
  );
}

export function QueuePanel({ queue }: { queue: QueueQuery }) {
  const t = useTranslations();
  return (
    <WorkPanel title={t('home.kpiWaitingPay')} action={<ViewAllLink href="/cashier" />}>
      <QueryView
        query={queue}
        inPanel
        columns={2}
        isEmpty={(rows) => rows.length === 0}
        empty={{ title: t('cashier.queueEmpty') }}
      >
        {(rows) => <QueueList rows={rows} />}
      </QueryView>
    </WorkPanel>
  );
}

export function ReceptionHome({ granted, now }: { granted: ReadonlySet<string>; now: Date }) {
  const t = useTranslations();
  const canSessions = granted.has('scheduling.schedule.manage');
  const canQueue = granted.has('billing.payment.record');
  const sessions = useTodaySessions(hospitalToday(now), canSessions);
  const queue = useCashierQueue(canQueue);

  return (
    <div className="flex flex-col gap-4">
      <TileRow>
        {canSessions ? <SessionTiles sessions={sessions} now={now} /> : null}
        {canQueue ? <QueueTile queue={queue} /> : null}
      </TileRow>
      <QuickActions granted={granted} />
      <div className="grid gap-4 xl:grid-cols-3">
        {canSessions ? (
          <WorkPanel
            title={t('home.panelSessions')}
            action={<ViewAllLink href="/schedules" />}
            className="xl:col-span-2"
          >
            <QueryView
              query={sessions}
              inPanel
              columns={4}
              isEmpty={(rows) => rows.length === 0}
              empty={{ title: t('home.panelSessionsEmpty'), hint: t('home.panelSessionsHint') }}
            >
              {(rows) => <SessionsTable sessions={rows} now={now} />}
            </QueryView>
          </WorkPanel>
        ) : null}
        {canQueue ? <QueuePanel queue={queue} /> : null}
      </div>
    </div>
  );
}
