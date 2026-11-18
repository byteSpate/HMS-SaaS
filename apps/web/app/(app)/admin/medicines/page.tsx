'use client';
// Medicines (T-CLI-03; FR-CLI-004, FR-PHA-011 subset): the hospital's medicine catalogue as a
// table, active ones first, by brand. Doctors prescribe from the active entries. Add or edit one
// in a dialog. admin.config.publish; the API enforces it.
import type { MedicineRecord } from '@hms/contracts';
import { Button, IconButton, PageLayout, StatusBadge } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MEDICINES_QUERY_KEY, medicinesApi } from '../../../../src/api/medicines';
import {
  CELL,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../../src/components/admin/admin-table';
import { MedicineDialog } from '../../../../src/components/medicines/medicine-dialog';
import { medicineTitle } from '../../../../src/components/medicines/medicine-form';
import { QueryView } from '../../../../src/components/query-view';

type OpenDialog = { kind: 'add' } | { kind: 'edit'; medicineId: string } | null;

const SUBTEXT = 'text-[0.6875rem] text-text-muted';

function MedicineName({ medicine }: { medicine: MedicineRecord }) {
  return (
    <>
      <p className={ROW_TITLE}>{medicineTitle(medicine)}</p>
      {medicine.nameBn ? (
        <p lang="bn" className={SUBTEXT}>
          {medicine.nameBn}
        </p>
      ) : null}
    </>
  );
}

export default function MedicinesPage() {
  const t = useTranslations();
  const medicines = useQuery({ queryKey: MEDICINES_QUERY_KEY, queryFn: medicinesApi.list });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const editing =
    dialog?.kind === 'edit'
      ? medicines.data?.find((row) => row.medicineId === dialog.medicineId)
      : undefined;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <PageLayout
      title={t('medicines.title')}
      description={t('medicines.description')}
      actions={<Button onClick={() => setDialog({ kind: 'add' })}>{t('medicines.add')}</Button>}
    >
      <QueryView
        query={medicines}
        isEmpty={(rows) => rows.length === 0}
        empty={{ title: t('medicines.empty'), hint: t('medicines.emptyHint') }}
        columns={5}
      >
        {(rows) => (
          <div className={TABLE_FRAME}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('medicines.columnMedicine')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('medicines.columnGeneric')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('medicines.columnForm')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('medicines.columnStatus')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-end`}>
                    {t('medicines.columnActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((medicine) => (
                  <tr key={medicine.medicineId} className={ROW}>
                    <td className={CELL} data-label={t('medicines.columnMedicine')}>
                      <MedicineName medicine={medicine} />
                    </td>
                    <td className={CELL} data-label={t('medicines.columnGeneric')}>
                      {medicine.genericName}
                      {medicine.manufacturer ? (
                        <p className={SUBTEXT}>{medicine.manufacturer}</p>
                      ) : null}
                    </td>
                    <td className={CELL} data-label={t('medicines.columnForm')}>
                      {medicine.form}
                    </td>
                    <td className={CELL} data-label={t('medicines.columnStatus')}>
                      {medicine.active ? (
                        <StatusBadge
                          size="sm"
                          status="active"
                          label={t('medicines.statusActive')}
                        />
                      ) : (
                        <StatusBadge
                          size="sm"
                          status="idle"
                          label={t('medicines.statusInactive')}
                        />
                      )}
                    </td>
                    <td className={`${CELL} text-end`} data-cell="actions">
                      <IconButton
                        icon="pencil"
                        label={`${t('medicines.edit')}: ${medicineTitle(medicine)}`}
                        variant="secondary"
                        onClick={() => setDialog({ kind: 'edit', medicineId: medicine.medicineId })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      {dialog?.kind === 'add' ? <MedicineDialog onOpenChange={close} /> : null}
      {editing ? (
        <MedicineDialog
          key={`${editing.medicineId}:${editing.version}`}
          medicine={editing}
          onOpenChange={close}
        />
      ) : null}
    </PageLayout>
  );
}
