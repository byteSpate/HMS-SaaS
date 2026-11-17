'use client';
// The doctor's home (Role Home v2 design, role "doctor"; F section 2.1): how many patients are
// waiting and for how long, who is in consultation, who has been seen, and today's queue in
// serial order with a link to the worklist, where consultations are started. It reads the same
// polled worklist as the worklist screen (T-CLI-01; ADR-015), so both share one cache.
// Needs clinical.consultation.record. Implements: T-UI-03.
import type { DoctorWorklist } from '@hms/contracts';
import { Alert, buttonClassName, StatusBadge, WorkPanel } from '@hms/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { WORKLIST_QUERY_KEY, worklistApi, type PolledWorklist } from '../../api/worklist';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, PANEL_TABLE } from '../admin/admin-table';
import { displayName } from '../patients/patient-text';
import { QueryView } from '../query-view';
import { waitingMinutes, WORKLIST_STATUS } from '../worklist/worklist-rules';
import { longestWaitMinutes, worklistCounts } from './home-rules';
import { HomeTile, TileRow, tileState, useDigits } from './home-parts';

/** The worklist screen's poll interval, so the home is as fresh as the worklist. */
const POLL_MS = 20_000;

function QueueTable({ worklist, now }: { worklist: DoctorWorklist; now: Date }) {
  const t = useTranslations();
  const digits = useDigits();
  const entries = worklist.sessions.flatMap((session) => session.entries);
  return (
    <table className={PANEL_TABLE}>
      <thead>
        <tr>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('worklist.columnSerial')}
          </th>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('worklist.columnPatient')}
          </th>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('worklist.columnStatus')}
          </th>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('worklist.columnWaiting')}
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const { labelKey, badge } = WORKLIST_STATUS[entry.status];
          const minutes = waitingMinutes(entry, now);
          return (
            <tr key={entry.appointmentId} className={ROW}>
              <td className={`${CELL} tabular-nums`} data-cell="inline">
                {entry.queueNumber === null ? '-' : digits(entry.queueNumber)}
              </td>
              <td className={CELL}>
                <span className={ROW_TITLE}>{displayName(entry.patient)}</span>{' '}
                <span className="text-text-muted">{entry.patient.mrn}</span>
              </td>
              <td className={CELL}>
                <StatusBadge size="sm" status={badge} label={t(labelKey)} />
              </td>
              <td className={`${CELL} tabular-nums`} data-label={t('worklist.columnWaiting')}>
                {minutes === null ? '-' : t('worklist.minutes', { minutes: digits(minutes) })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function DoctorHome({ now }: { now: Date }) {
  const t = useTranslations();
  const digits = useDigits();
  const queryClient = useQueryClient();
  const polled = useQuery({
    queryKey: WORKLIST_QUERY_KEY,
    queryFn: () => worklistApi.today(queryClient.getQueryData<PolledWorklist>(WORKLIST_QUERY_KEY)),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
  const worklist = polled.data?.worklist;
  const counts = worklist ? worklistCounts(worklist) : null;
  const longest = worklist ? longestWaitMinutes(worklist, now) : null;
  const state = tileState(polled);
  const worklistQuery = { ...polled, data: worklist };

  return (
    <div className="flex flex-col gap-4">
      {worklist && worklist.practitioner === null ? (
        <Alert tone="info">{t('worklist.notLinked')}</Alert>
      ) : null}
      <TileRow>
        <HomeTile
          label={t('home.kpiWaiting')}
          value={counts ? digits(counts.WAITING) : undefined}
          note={
            longest === null
              ? t('home.kpiWaitingNoteNone')
              : t('home.kpiWaitingNote', { minutes: digits(longest) })
          }
          state={state}
          href="/worklist"
        />
        <HomeTile
          label={t('home.kpiInConsultation')}
          value={counts ? digits(counts.IN_CONSULTATION) : undefined}
          state={state}
          href="/worklist"
        />
        <HomeTile
          label={t('home.kpiSeen')}
          value={counts ? digits(counts.CONSULTED) : undefined}
          state={state}
          href="/worklist"
        />
        <HomeTile
          label={t('home.kpiExpected')}
          value={counts ? digits(counts.EXPECTED) : undefined}
          note={
            counts
              ? t('home.kpiExpectedNote', { count: digits(counts.WAITING_PAYMENT) })
              : undefined
          }
          state={state}
          href="/worklist"
        />
      </TileRow>

      <WorkPanel
        title={t('home.panelQueue')}
        action={
          <Link href="/worklist" className={buttonClassName('primary')}>
            {t('home.actionWorklist')}
          </Link>
        }
      >
        <QueryView
          query={worklistQuery}
          inPanel
          columns={4}
          isEmpty={(data) => data.sessions.length === 0}
          empty={{ title: t('worklist.noSessions') }}
        >
          {(data) =>
            data.sessions.every((session) => session.entries.length === 0) ? (
              <p className="px-4 py-5 text-text-muted">{t('worklist.sessionEmptyHint')}</p>
            ) : (
              <QueueTable worklist={data} now={now} />
            )
          }
        </QueryView>
      </WorkPanel>
    </div>
  );
}
