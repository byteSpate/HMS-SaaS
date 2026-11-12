'use client';
// The cashier's own session on the cashier desk (T-BIL-03; FR-BIL-026; UC-BIL-04; W-02 header):
// either "no open session" with Open session, or the open session with its float, what each
// method should hold so far, and Close session. Payments need an open session (T-BIL-04).
import type { CashierSession } from '@hms/contracts';
import { formatDateTime, formatMoney, type Locale } from '@hms/i18n';
import { Button, StatusBadge } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CloseSessionDialog, OpenSessionDialog } from './session-dialogs';
import { SessionTotals } from './session-totals';

export function SessionPanel({ session }: { session: CashierSession | null }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [dialog, setDialog] = useState<'open' | 'close' | null>(null);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <section
      aria-labelledby="cashier-session-title"
      className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="cashier-session-title" className="text-base font-semibold">
            {t('cashier.sessionTitle')}
          </h2>
          {session ? (
            <StatusBadge size="sm" status="active" label={t('cashier.statusOPEN')} />
          ) : null}
        </div>
        {session ? (
          <Button variant="secondary" onClick={() => setDialog('close')}>
            {t('cashier.closeSession')}
          </Button>
        ) : (
          <Button onClick={() => setDialog('open')}>{t('cashier.openSession')}</Button>
        )}
      </div>
      {session ? (
        <>
          <p className="text-sm text-text-muted">
            {t('cashier.openSince', { time: formatDateTime(session.openedAt, locale) })}
            {' - '}
            {t('cashier.floatLine', {
              amount: formatMoney(session.openingFloat, locale, { symbol: 'sign' }),
            })}
          </p>
          <SessionTotals totals={session.totals} />
        </>
      ) : (
        <p className="text-sm text-text-muted">{t('cashier.noSession')}</p>
      )}

      {dialog === 'open' ? <OpenSessionDialog onOpenChange={close} /> : null}
      {dialog === 'close' && session ? (
        <CloseSessionDialog session={session} onOpenChange={close} />
      ) : null}
    </section>
  );
}
