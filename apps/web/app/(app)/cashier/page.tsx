'use client';
// The cashier desk (T-BIL-03, T-BIL-04; SCR-06, SCR-07; W-02; FR-BIL-026): the cashier's own
// session first, since every payment is recorded in an open session. With a session open: today's
// queue and a patient search on one side, the chosen patient's open invoices and the payment on
// the other, and the session's payments with their receipts below. billing.cashier_session.manage
// and billing.payment.record; the API enforces both.
import type { PatientRef } from '@hms/contracts';
import { Alert, PageLayout, Skeleton } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CASHIER_SESSION_QUERY_KEY, cashierSessionsApi } from '../../../src/api/cashier-sessions';
import { PatientPicker } from '../../../src/components/cashier/patient-picker';
import { PaymentDesk } from '../../../src/components/cashier/payment-desk';
import { SessionPayments } from '../../../src/components/cashier/receipts';
import { SessionPanel } from '../../../src/components/cashier/session-panel';
import { useApiErrorMessage } from '../../../src/i18n/use-api-error-message';

export default function CashierDeskPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const [patient, setPatient] = useState<PatientRef | null>(null);
  const current = useQuery({
    queryKey: [...CASHIER_SESSION_QUERY_KEY, 'current'],
    queryFn: cashierSessionsApi.current,
  });
  const session = current.data ?? null;

  return (
    <PageLayout title={t('cashier.title')} description={t('cashier.description')}>
      {current.error ? <Alert tone="danger">{errorMessage(current.error)}</Alert> : null}
      {current.isPending ? <Skeleton className="h-40" /> : null}
      {current.isSuccess ? <SessionPanel session={session} /> : null}
      {session ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <PatientPicker onSelect={setPatient} />
            {patient ? (
              <PaymentDesk
                key={patient.patientId}
                patient={patient}
                onNext={() => setPatient(null)}
              />
            ) : (
              <p className="text-sm text-text-muted">{t('cashier.selectPatient')}</p>
            )}
          </div>
          <SessionPayments sessionId={session.sessionId} />
        </>
      ) : null}
    </PageLayout>
  );
}
