'use client';
// Practitioners (T-PRA-01; FR-PRA-001..003): the hospital's doctors as a table, active ones first,
// with their degrees, specialty and registration number, which tell two doctors with the same
// name apart. Add or edit one in a dialog. practitioner.manage; the API enforces it.
import { Alert, Button, IconButton, PageLayout, Skeleton, StatusBadge } from '@hms/ui';
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
import { practitionerName } from '../../../../src/components/practitioners/practitioner-form';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';

/** The add dialog, or the edit dialog for one practitioner. */
type OpenDialog = { kind: 'add' } | { kind: 'edit'; practitionerId: string } | null;

export default function PractitionersPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
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
      {practitioners.error ? (
        <Alert tone="danger">{errorMessage(practitioners.error)}</Alert>
      ) : null}
      {practitioners.isPending ? <Skeleton className="h-40" /> : null}
      {practitioners.data?.length === 0 ? (
        <p className="text-sm text-text-muted">{t('practitioners.empty')}</p>
      ) : null}
      {practitioners.data && practitioners.data.length > 0 ? (
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
              {practitioners.data.map((practitioner) => {
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
                    <td className={CELL}>
                      <p>{practitioner.specialty ?? '-'}</p>
                      {practitioner.degrees ? (
                        <p className="text-[0.6875rem] text-text-muted">{practitioner.degrees}</p>
                      ) : null}
                    </td>
                    <td className={CELL}>{practitioner.registrationNo ?? '-'}</td>
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
                    <td className={`${CELL} text-end`}>
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
      ) : null}
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
