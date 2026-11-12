'use client';
// Receipts on the cashier desk (T-BIL-04; FR-BIL-027; F section 5 "Reprint"): printing a payment's
// receipt in the screen's language, and the session's payments with a Reprint button. The server
// numbers each print, so copy 2 and later say "Copy n"; a print never creates a payment.
import type { Payment } from '@hms/contracts';
import { formatDateTime, formatMoney, type Locale } from '@hms/i18n';
import { Alert, Button, Skeleton } from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { PAYMENTS_QUERY_KEY, paymentsApi } from '../../api/payments';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { printHtml } from '../../print-html';
import { CELL, HEAD_CELL, ROW, TABLE, TABLE_FRAME } from '../admin/admin-table';
import { displayName } from '../patients/patient-text';

/** Prints a payment's receipt; each click is a new print, so it gets its own key. */
export function usePrintReceipt() {
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) =>
      paymentsApi.print(paymentId, { language: locale }, crypto.randomUUID()),
    onSuccess: async (receipt) => {
      printHtml(receipt.html);
      await queryClient.invalidateQueries({ queryKey: PAYMENTS_QUERY_KEY });
    },
  });
}

export function SessionPayments({ sessionId }: { sessionId: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const errorMessage = useApiErrorMessage();
  const print = usePrintReceipt();
  const payments = useQuery({
    queryKey: [...PAYMENTS_QUERY_KEY, 'session', sessionId],
    queryFn: () => paymentsApi.ofSession(sessionId),
  });
  const money = (amount: string) => formatMoney(amount, locale, { symbol: 'sign' });

  return (
    <section aria-labelledby="session-payments-title" className="flex flex-col gap-2">
      <h2 id="session-payments-title" className="text-base font-semibold">
        {t('cashier.sessionPayments')}
      </h2>
      {payments.error ? <Alert tone="danger">{errorMessage(payments.error)}</Alert> : null}
      {print.error ? <Alert tone="danger">{errorMessage(print.error)}</Alert> : null}
      {payments.isPending ? <Skeleton className="h-24" /> : null}
      {payments.data?.length === 0 ? (
        <p className="text-sm text-text-muted">{t('cashier.noPayments')}</p>
      ) : null}
      {payments.data && payments.data.length > 0 ? (
        <div className={TABLE_FRAME}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('cashier.columnReceipt')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('cashier.columnPatient')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('cashier.columnTime')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-end`}>
                  {t('cashier.columnAmount')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-end`}>
                  {t('cashier.columnActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.data.map((payment: Payment) => (
                <tr key={payment.paymentId} className={ROW}>
                  <td className={CELL}>{payment.receiptNumber}</td>
                  <td className={CELL}>{displayName(payment.patient)}</td>
                  <td className={CELL}>{formatDateTime(payment.receivedAt, locale)}</td>
                  <td className={`${CELL} text-end tabular-nums`}>{money(payment.amount)}</td>
                  <td className={`${CELL} text-end`}>
                    <Button
                      variant="secondary"
                      loading={print.isPending && print.variables === payment.paymentId}
                      onClick={() => print.mutate(payment.paymentId)}
                    >
                      {payment.printCount > 0 ? t('cashier.reprint') : t('cashier.printReceipt')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
