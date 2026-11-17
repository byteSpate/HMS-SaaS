'use client';
// Practitioners (T-PRA-01; FR-PRA-001..003): the hospital's doctors as a table, active ones first,
// with their degrees, specialty and registration number, which tell two doctors with the same
// name apart, and their department (T-PRA-02). Add or edit one in a dialog. practitioner.manage; the API enforces it.
import { Button, IconButton, PageLayout, StatusBadge } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PRACTITIONERS_QUERY_KEY, practitionersApi } from '../../../../src/api/practitioners';
import {
  CELL,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../../src/components/admin/admin-table';
import { PractitionerDialog } from '../../../../src/components/practitioners/practitioner-dialog';
import { QueryView } from '../../../../src/components/query-view';
import {
  departmentLabel,
  practitionerName,
} from '../../../../src/components/practitioners/practitioner-form';

/** The add dialog, or the edit dialog for one practitioner. */
type OpenDialog = { kind: 'add' } | { kind: 'edit'; practitionerId: string } | null;

export default function PractitionersPage() {
  const t = useTranslations();
  const practitioners = useQuery({
    queryKey: PRACTITIONERS_QUERY_KEY,
    queryFn: practitionersApi.list,
  });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const editing =
    dialog?.kind === 'edit'
      ? practitioners.data?.find((row) => row.practitionerId === dialog.practitionerId)
      : undefined;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <PageLayout
      title={t('practitioners.title')}
      description={t('practitioners.description')}
      actions={<Button onClick={() => setDialog({ kind: 'add' })}>{t('practitioners.add')}</Button>}
    >
      <QueryView
        query={practitioners}
        isEmpty={(rows) => rows.length === 0}
        empty={{ title: t('practitioners.empty'), hint: t('practitioners.emptyHint') }}
        columns={6}
      >
        {(rows) => (
          <div className={TABLE_FRAME}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('practitioners.columnName')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('practitioners.columnSpecialty')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('practitioners.columnDepartment')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('practitioners.columnRegistration')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('practitioners.columnStatus')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-end`}>
                    {t('practitioners.columnActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((practitioner) => {
                  const name = practitionerName(practitioner);
                  return (
                    <tr key={practitioner.practitionerId} className={ROW}>
                      <td className={CELL}>
                        <p className={ROW_TITLE}>{name}</p>
                        {practitioner.nameEn && practitioner.nameBn ? (
                          <p lang="bn" className="text-[0.6875rem] text-text-muted">
                            {practitioner.nameBn}
                          </p>
                        ) : null}
                      </td>
                      <td className={CELL} data-label={t('practitioners.columnSpecialty')}>
                        <p>{practitioner.specialty ?? '-'}</p>
                        {practitioner.degrees ? (
                          <p className="text-[0.6875rem] text-text-muted">{practitioner.degrees}</p>
                        ) : null}
                      </td>
                      <td className={CELL} data-label={t('practitioners.columnDepartment')}>
                        {practitioner.department ? departmentLabel(practitioner.department) : '-'}
                      </td>
                      <td className={CELL} data-label={t('practitioners.columnRegistration')}>
                        {practitioner.registrationNo ?? '-'}
                      </td>
                      <td className={CELL}>
                        {practitioner.active ? (
                          <StatusBadge
                            size="sm"
                            status="active"
                            label={t('practitioners.statusActive')}
                          />
                        ) : (
                          <StatusBadge
                            size="sm"
                            status="idle"
                            label={t('practitioners.statusInactive')}
                          />
                        )}
                      </td>
                      <td className={`${CELL} text-end`} data-cell="actions">
                        <IconButton
                          icon="pencil"
                          label={`${t('practitioners.edit')}: ${name}`}
                          variant="secondary"
                          onClick={() =>
                            setDialog({ kind: 'edit', practitionerId: practitioner.practitionerId })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
      {dialog?.kind === 'add' ? <PractitionerDialog onOpenChange={close} /> : null}
      {editing ? (
        <PractitionerDialog
          key={`${editing.practitionerId}:${editing.version}`}
          practitioner={editing}
          onOpenChange={close}
        />
      ) : null}
    </PageLayout>
  );
}
