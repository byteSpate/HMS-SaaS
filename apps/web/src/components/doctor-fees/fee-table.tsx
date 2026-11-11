'use client';
// One price list version's doctor fees as a table (T-BIL-01; C-041): the doctor, the new-patient
// fee, the follow-up fee and the follow-up window. In the draft each row can be edited or removed;
// the version in force is read-only. Amounts are formatted from their strings (ADR-007).
import type { DoctorFee } from '@hms/contracts';
import { formatMoney, toLocaleDigits, type Locale } from '@hms/i18n';
import { IconButton } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import { CELL, HEAD_CELL, ROW, ROW_TITLE, TABLE, TABLE_FRAME } from '../admin/admin-table';

export const doctorNameOf = (fee: Pick<DoctorFee, 'practitioner'>) =>
  fee.practitioner.nameEn ?? fee.practitioner.nameBn ?? '';

export interface FeeRowActions {
  onEdit: (fee: DoctorFee) => void;
  onRemove: (fee: DoctorFee) => void;
  /** The practitioner whose removal is being sent, so its button waits. */
  removingId?: string;
}

export function FeeTable({ fees, actions }: { fees: DoctorFee[]; actions?: FeeRowActions }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const money = (amount: string) => formatMoney(amount, locale, { symbol: 'sign' });

  return (
    <div className={TABLE_FRAME}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={`${HEAD_CELL} text-start`}>
              {t('doctorFees.columnDoctor')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {t('doctorFees.columnNewPatient')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {t('doctorFees.columnFollowUp')}
            </th>
            <th scope="col" className={`${HEAD_CELL} text-end`}>
              {t('doctorFees.columnWindow')}
            </th>
            {actions ? (
              <th scope="col" className={`${HEAD_CELL} text-end`}>
                {t('doctorFees.columnActions')}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {fees.map((fee) => {
            const name = doctorNameOf(fee);
            return (
              <tr key={fee.practitioner.practitionerId} className={ROW}>
                <td className={CELL}>
                  <p className={ROW_TITLE}>{name}</p>
                  {fee.practitioner.specialty ? (
                    <p className="text-[0.6875rem] text-text-muted">{fee.practitioner.specialty}</p>
                  ) : null}
                </td>
                <td className={`${CELL} text-end tabular-nums`}>{money(fee.newPatientFee)}</td>
                <td className={`${CELL} text-end tabular-nums`}>{money(fee.followUpFee)}</td>
                <td className={`${CELL} text-end tabular-nums`}>
                  {t('doctorFees.windowDays', {
                    days: toLocaleDigits(String(fee.followUpDays), locale),
                  })}
                </td>
                {actions ? (
                  <td className={`${CELL} text-end`}>
                    <span className="inline-flex gap-1">
                      <IconButton
                        icon="pencil"
                        label={`${t('doctorFees.edit')}: ${name}`}
                        variant="secondary"
                        onClick={() => actions.onEdit(fee)}
                      />
                      <IconButton
                        icon="trash"
                        label={`${t('doctorFees.remove')}: ${name}`}
                        variant="secondary"
                        disabled={actions.removingId === fee.practitioner.practitionerId}
                        onClick={() => actions.onRemove(fee)}
                      />
                    </span>
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
