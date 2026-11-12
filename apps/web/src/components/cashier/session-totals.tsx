'use client';
// A cashier session's amounts per payment method (T-BIL-03; FR-BIL-026): what was expected from
// the payments (plus the float for cash), what was counted at closing, and the difference. The
// server computes all three; this table only formats them (FR-BIL-035).
import type { CashierSessionTotal, PaymentMethod } from '@hms/contracts';
import { formatMoney, type Locale } from '@hms/i18n';
import { useLocale, useTranslations } from 'next-intl';
import { CELL, HEAD_CELL, ROW } from '../admin/admin-table';

// Four short columns fit a dialog: no minimum width, so it never becomes a scroll region.
const FRAME = 'rounded-panel border border-border bg-surface';
const TOTALS_TABLE = 'w-full text-start text-xs';

// Full catalog keys as literals, so the unused-key check can see them.
export const METHOD_LABEL_KEYS: Record<PaymentMethod, `cashier.method${PaymentMethod}`> = {
  CASH: 'cashier.methodCASH',
  CARD: 'cashier.methodCARD',
  MOBILE: 'cashier.methodMOBILE',
  BANK_TRANSFER: 'cashier.methodBANK_TRANSFER',
};

export function SessionTotals({ totals }: { totals: readonly CashierSessionTotal[] }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const money = (amount: string) => formatMoney(amount, locale, { symbol: 'sign' });
  const closed = totals.some((row) => row.counted !== null);

  return (
    <div className={FRAME}>
      <table className={TOTALS_TABLE}>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('cashier.columnMethod')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {t('cashier.columnExpected')}
            </th>
            {closed ? (
              <>
                <th scope="col" className={`${HEAD_CELL} text-end`}>
                  {t('cashier.columnCounted')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-end`}>
                  {t('cashier.columnVariance')}
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {totals.map((row) => (
            <tr key={row.method} className={ROW}>
              <td className={CELL}>{t(METHOD_LABEL_KEYS[row.method])}</td>
              <td className={`${CELL} text-end tabular-nums`}>{money(row.expected)}</td>
              {closed ? (
                <>
                  <td className={`${CELL} text-end tabular-nums`}>
                    {row.counted ? money(row.counted) : null}
                  </td>
                  <td
                    className={`${CELL} text-end tabular-nums ${
                      row.variance && row.variance !== '0.00' ? 'font-semibold text-danger' : ''
                    }`}
                  >
                    {row.variance ? money(row.variance) : null}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
