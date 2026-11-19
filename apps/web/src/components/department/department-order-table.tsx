'use client';
// One part of the department worklist (T-ORD-02; FR-LAB-004, FR-ORD-004, FR-ORD-007): patient,
// service with priority and report time, when it was ordered, and the amount (or what is still
// due, for orders awaiting payment). Ready orders get a Start button; the server checks payment
// again when it is pressed (FR-BIL-003).
import type { DepartmentWorklistOrder } from '@hms/contracts';
import { formatMoney, formatTimeOfDay, toLocaleDigits, type Locale } from '@hms/i18n';
import { Button } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, TABLE, TABLE_FRAME } from '../admin/admin-table';
import { PRIORITY_KEYS } from '../orders/order-labels';
import { displayName } from '../patients/patient-text';
import { serviceName } from '../services/service-form';

export function DepartmentOrderTable({
  orders,
  emptyText,
  showDue,
  onStart,
  startingId,
}: {
  orders: DepartmentWorklistOrder[];
  emptyText: string;
  /** Awaiting payment: show what is still due instead of the amount. */
  showDue: boolean;
  /** Ready orders only. */
  onStart?: (order: DepartmentWorklistOrder) => void;
  startingId?: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  if (orders.length === 0) return <p className="text-sm text-text-muted">{emptyText}</p>;
  const amountHead = showDue ? t('department.columnDue') : t('orders.columnAmount');
  return (
    <div className={TABLE_FRAME}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('department.columnPatient')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('orders.columnService')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('department.columnOrdered')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {amountHead}
            </th>
            {onStart ? (
              <th scope="col" className={`${HEAD_CELL} text-end`}>
                {t('orders.columnActions')}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const service = serviceName(order.service, locale);
            const patient = displayName(order.patient);
            return (
              <tr key={order.orderId} className={ROW}>
                <td className={CELL}>
                  <p className={ROW_TITLE}>{patient}</p>
                  <p className="text-[0.6875rem] text-text-muted">{order.patient.mrn}</p>
                </td>
                <td className={CELL} data-label={t('orders.columnService')}>
                  <p className="font-medium">{service}</p>
                  <p className="text-[0.6875rem] text-text-muted">
                    {t(PRIORITY_KEYS[order.priority])}
                    {order.reportHours === null
                      ? ''
                      : ` - ${t('orders.reportIn', { hours: toLocaleDigits(String(order.reportHours), locale) })}`}
                    {order.clinicalNote ? ` - ${order.clinicalNote}` : ''}
                  </p>
                </td>
                <td className={`${CELL} tabular-nums`} data-label={t('department.columnOrdered')}>
                  {formatTimeOfDay(order.requestedAt, locale)}
                </td>
                <td className={`${CELL} text-end tabular-nums`} data-label={amountHead}>
                  {formatMoney(showDue ? order.payment.due : order.payment.amount, locale, {
                    symbol: 'sign',
                  })}
                </td>
                {onStart ? (
                  <td className={`${CELL} text-end`} data-cell="actions">
                    <Button
                      aria-label={t('department.startLabel', { service, patient })}
                      loading={startingId === order.orderId}
                      onClick={() => onStart(order)}
                    >
                      {t('department.start')}
                    </Button>
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
