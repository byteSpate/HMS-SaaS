'use client';
// The finance home (Role Home v2 design, role "management", narrowed to the finance data that
// exists today): closed cashier sessions waiting for review and how many show a difference, what
// patients still owe, and who is waiting to pay. Sessions need billing.cashier_session.review,
// the queue billing.payment.record (FR-ACC-009). Implements: T-UI-03, FR-BIL-026.
import type { CashierSession } from '@hms/contracts';
import { formatDateTime, formatMoney, type Locale } from '@hms/i18n';
import { StatusBadge, WorkPanel } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { CASHIER_SESSION_QUERY_KEY, cashierSessionsApi } from '../../api/cashier-sessions';
import { sumAmounts } from '../../money';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, PANEL_TABLE } from '../admin/admin-table';
import { QueryView } from '../query-view';
import { queueBalances } from './home-rules';
import { HomeTile, TileRow, tileState, useDigits, ViewAllLink } from './home-parts';
import { QueuePanel, useCashierQueue } from './reception-home';

function ReviewTable({ sessions }: { sessions: CashierSession[] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (
    <table className={PANEL_TABLE}>
      <thead>
        <tr>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('cashierSessions.columnCashier')}
          </th>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('cashierSessions.columnClosed')}
          </th>
          <th scope="col" className={`${HEAD_CELL} text-start`}>
            {t('cashierSessions.columnDifference')}
          </th>
        </tr>
      </thead>
      <tbody>
        {sessions.slice(0, 6).map((session) => (
          <tr key={session.sessionId} className={ROW}>
            <td className={CELL}>
              <span className={ROW_TITLE}>{session.cashier.displayName}</span>
            </td>
            <td className={CELL} data-label={t('cashierSessions.columnClosed')}>
              {session.closedAt ? formatDateTime(session.closedAt, locale) : '-'}
            </td>
            <td className={CELL}>
              <StatusBadge
                size="sm"
                status={session.hasVariance ? 'attention' : 'done'}
                label={
                  session.hasVariance
                    ? t('cashierSessions.withDifference')
                    : t('cashierSessions.noDifference')
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function FinanceHome({ granted }: { granted: ReadonlySet<string> }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const digits = useDigits();
  const canReview = granted.has('billing.cashier_session.review');
  const canQueue = granted.has('billing.payment.record');
  const pending = useQuery({
    queryKey: [...CASHIER_SESSION_QUERY_KEY, 'list', 'CLOSED_PENDING_REVIEW'],
    queryFn: () => cashierSessionsApi.list('CLOSED_PENDING_REVIEW'),
    enabled: canReview,
  });
  const queue = useCashierQueue(canQueue);
  const withDifference = pending.data?.filter((session) => session.hasVariance).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <TileRow>
        {canReview ? (
          <HomeTile
            label={t('home.kpiReview')}
            value={pending.data ? digits(pending.data.length) : undefined}
            note={t('home.kpiReviewNote', { count: digits(withDifference) })}
            state={tileState(pending)}
            href="/cashier-sessions"
          />
        ) : null}
        {canQueue ? (
          <HomeTile
            label={t('home.kpiDue')}
            value={
              queue.data
                ? formatMoney(sumAmounts(queueBalances(queue.data)), locale, { symbol: 'sign' })
                : undefined
            }
            note={
              queue.data ? t('home.kpiDueNote', { count: digits(queue.data.length) }) : undefined
            }
            state={tileState(queue)}
            href="/cashier"
          />
        ) : null}
      </TileRow>

      <div className="grid gap-4 xl:grid-cols-3">
        {canReview ? (
          <WorkPanel
            title={t('home.panelReview')}
            action={<ViewAllLink href="/cashier-sessions" />}
            className="xl:col-span-2"
          >
            <QueryView
              query={pending}
              inPanel
              columns={3}
              isEmpty={(rows) => rows.length === 0}
              empty={{
                title: t('cashierSessions.empty'),
                hint: t('cashierSessions.emptyHint'),
              }}
            >
              {(rows) => <ReviewTable sessions={rows} />}
            </QueryView>
          </WorkPanel>
        ) : null}
        {canQueue ? <QueuePanel queue={queue} /> : null}
      </div>
    </div>
  );
}
