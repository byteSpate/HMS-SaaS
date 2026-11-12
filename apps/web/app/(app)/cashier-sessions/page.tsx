'use client';
// Cashier sessions for finance (T-BIL-03; SCR-21 session review; FR-BIL-026; UC-BIL-04): closed
// sessions waiting for review, oldest first, and those already reviewed. A finance user other
// than the cashier accepts each one. billing.cashier_session.review; the API enforces it.
import type { CashierSession } from '@hms/contracts';
import { formatDateTime, type Locale } from '@hms/i18n';
import { Alert, Button, PageLayout, Skeleton, StatusBadge, Tabs } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CASHIER_SESSION_QUERY_KEY, cashierSessionsApi } from '../../../src/api/cashier-sessions';
import {
  CELL,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../src/components/admin/admin-table';
import { ReviewSessionDialog } from '../../../src/components/cashier/review-session-dialog';
import { useApiErrorMessage } from '../../../src/i18n/use-api-error-message';

type ListStatus = 'CLOSED_PENDING_REVIEW' | 'REVIEWED';

function SessionList({
  status,
  onReview,
}: {
  status: ListStatus;
  onReview: (session: CashierSession) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const errorMessage = useApiErrorMessage();
  const sessions = useQuery({
    queryKey: [...CASHIER_SESSION_QUERY_KEY, 'list', status],
    queryFn: () => cashierSessionsApi.list(status),
  });

  if (sessions.error) return <Alert tone="danger">{errorMessage(sessions.error)}</Alert>;
  if (sessions.isPending) return <Skeleton className="h-40" />;
  if (sessions.data.length === 0) {
    return <p className="text-sm text-text-muted">{t('cashierSessions.empty')}</p>;
  }
  return (
    <div className={TABLE_FRAME}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('cashierSessions.columnCashier')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('cashierSessions.columnOpened')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('cashierSessions.columnClosed')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('cashierSessions.columnDifference')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {t('cashierSessions.columnActions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.data.map((session) => (
            <tr key={session.sessionId} className={ROW}>
              <td className={CELL}>
                <p className={ROW_TITLE}>{session.cashier.displayName}</p>
                {session.review ? (
                  <p className="text-[0.6875rem] text-text-muted">
                    {t('cashierSessions.reviewedBy', {
                      name: session.review.reviewedBy.displayName,
                      time: formatDateTime(session.review.reviewedAt, locale),
                    })}
                  </p>
                ) : null}
              </td>
              <td className={CELL}>{formatDateTime(session.openedAt, locale)}</td>
              <td className={CELL}>
                {session.closedAt ? formatDateTime(session.closedAt, locale) : null}
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
              <td className={`${CELL} text-end`}>
                {session.status === 'CLOSED_PENDING_REVIEW' ? (
                  <Button variant="secondary" onClick={() => onReview(session)}>
                    {t('cashierSessions.review')}
                  </Button>
                ) : (
                  <StatusBadge size="sm" status="done" label={t('cashier.statusREVIEWED')} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CashierSessionsPage() {
  const t = useTranslations();
  const [reviewing, setReviewing] = useState<CashierSession | null>(null);

  return (
    <PageLayout title={t('cashierSessions.title')} description={t('cashierSessions.description')}>
      <Tabs
        label={t('cashierSessions.title')}
        tabs={[
          {
            id: 'pending',
            label: t('cashierSessions.tabPending'),
            content: <SessionList status="CLOSED_PENDING_REVIEW" onReview={setReviewing} />,
          },
          {
            id: 'reviewed',
            label: t('cashierSessions.tabReviewed'),
            content: <SessionList status="REVIEWED" onReview={setReviewing} />,
          },
        ]}
      />
      {reviewing ? (
        <ReviewSessionDialog
          key={`${reviewing.sessionId}:${reviewing.version}`}
          session={reviewing}
          onOpenChange={(open) => {
            if (!open) setReviewing(null);
          }}
        />
      ) : null}
    </PageLayout>
  );
}
