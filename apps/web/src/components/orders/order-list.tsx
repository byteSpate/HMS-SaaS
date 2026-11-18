'use client';
// A visit's orders (T-ORD-01; FR-ORD-004, FR-ORD-007): the service, priority, its own status, and
// beside it whether its invoice line is paid, read from billing. The expected report time comes
// with the order. A row action (cancel, T-ORD-03) is passed in by the screen that allows it.
import type { ServiceOrder } from '@hms/contracts';
import { formatMoney, toLocaleDigits, type Locale } from '@hms/i18n';
import { StatusBadge } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, TABLE, TABLE_FRAME } from '../admin/admin-table';
import { serviceName } from '../services/service-form';
import { PAYMENT_KEYS, PRIORITY_KEYS, STATUS_KEYS } from './order-labels';
import { paymentStateOf } from './order-rules';

const PAYMENT_BADGE = { PAID: 'done', UNPAID: 'attention', CANCELLED: 'idle' } as const;

export function OrderList({
  orders,
  action,
}: {
  orders: ServiceOrder[];
  action?: (order: ServiceOrder) => ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  if (orders.length === 0) return <p className="text-sm text-text-muted">{t('orders.none')}</p>;
  return (
    <div className={TABLE_FRAME}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('orders.columnService')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('orders.columnStatus')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('orders.columnPayment')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {t('orders.columnAmount')}
            </th>
            {action ? (
              <th scope="col" className={`${HEAD_CELL} text-end`}>
                {t('orders.columnActions')}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const payment = paymentStateOf(order);
            const cancelled = order.status === 'CANCELLED';
            return (
              <tr key={order.orderId} className={ROW}>
                <td className={CELL}>
                  <p className={`${ROW_TITLE} ${cancelled ? 'line-through' : ''}`}>
                    {serviceName(order.service, locale)}
                  </p>
                  <p className="text-[0.6875rem] text-text-muted">
                    {t(PRIORITY_KEYS[order.priority])}
                    {order.reportHours === null
                      ? ''
                      : ` - ${t('orders.reportIn', { hours: toLocaleDigits(String(order.reportHours), locale) })}`}
                    {order.clinicalNote ? ` - ${order.clinicalNote}` : ''}
                  </p>
                  {order.cancelReason ? (
                    <p className="text-[0.6875rem] text-text-muted">
                      {t('orders.cancelReasonShown', { reason: order.cancelReason })}
                    </p>
                  ) : null}
                </td>
                <td className={CELL} data-label={t('orders.columnStatus')}>
                  {t(STATUS_KEYS[order.status])}
                </td>
                <td className={CELL} data-label={t('orders.columnPayment')}>
                  <StatusBadge
                    size="sm"
                    status={PAYMENT_BADGE[payment]}
                    label={t(PAYMENT_KEYS[payment])}
                  />
                </td>
                <td
                  className={`${CELL} text-end tabular-nums`}
                  data-label={t('orders.columnAmount')}
                >
                  {formatMoney(order.payment.amount, locale, { symbol: 'sign' })}
                </td>
                {action ? (
                  <td className={`${CELL} text-end`} data-cell="actions">
                    {action(order)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
