'use client';
// The cashier desk (T-BIL-03; SCR-06, SCR-07; FR-BIL-026): the cashier's own session first, since
// every payment is recorded in an open session. billing.cashier_session.manage; the API enforces it.
import { Alert, PageLayout, Skeleton } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CASHIER_SESSION_QUERY_KEY, cashierSessionsApi } from '../../../src/api/cashier-sessions';
import { SessionPanel } from '../../../src/components/cashier/session-panel';
import { useApiErrorMessage } from '../../../src/i18n/use-api-error-message';

export default function CashierDeskPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const current = useQuery({
    queryKey: [...CASHIER_SESSION_QUERY_KEY, 'current'],
    queryFn: cashierSessionsApi.current,
  });

  return (
    <PageLayout title={t('cashier.title')} description={t('cashier.description')}>
      {current.error ? <Alert tone="danger">{errorMessage(current.error)}</Alert> : null}
      {current.isPending ? <Skeleton className="h-40" /> : null}
      {current.isSuccess ? <SessionPanel session={current.data} /> : null}
    </PageLayout>
  );
}
