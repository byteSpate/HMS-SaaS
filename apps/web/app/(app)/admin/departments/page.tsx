'use client';
// Departments (T-PRA-02; FR-CFG-001, FR-I18N-006): the hospital's departments as a table, active
// ones first, by code. A name missing in one language shows the other with a visible marker, so
// the administrator sees what still needs translating. Add or edit one in a dialog.
// admin.config.publish; the API enforces it.
import type { DepartmentRecord } from '@hms/contracts';
import { Alert, Button, IconButton, PageLayout, Skeleton, StatusBadge } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DEPARTMENTS_QUERY_KEY, departmentsApi } from '../../../../src/api/departments';
import {
  CELL,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../../src/components/admin/admin-table';
import { DepartmentDialog } from '../../../../src/components/departments/department-dialog';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';

/** The add dialog, or the edit dialog for one department. */
type OpenDialog = { kind: 'add' } | { kind: 'edit'; departmentId: string } | null;

const MARKER = 'text-[0.6875rem] italic text-text-muted';

function DepartmentNames({ department }: { department: DepartmentRecord }) {
  const t = useTranslations();
  return (
    <>
      <p className={ROW_TITLE}>{department.nameEn ?? <span lang="bn">{department.nameBn}</span>}</p>
      {department.nameEn && department.nameBn ? (
        <p lang="bn" className="text-[0.6875rem] text-text-muted">
          {department.nameBn}
        </p>
      ) : null}
      {/* FR-I18N-006: the missing translation is marked, never silently filled. */}
      {department.nameBn ? null : <p className={MARKER}>{t('departments.missingBn')}</p>}
      {department.nameEn ? null : <p className={MARKER}>{t('departments.missingEn')}</p>}
    </>
  );
}

export default function DepartmentsPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const departments = useQuery({ queryKey: DEPARTMENTS_QUERY_KEY, queryFn: departmentsApi.list });
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const editing =
    dialog?.kind === 'edit'
      ? departments.data?.find((row) => row.departmentId === dialog.departmentId)
      : undefined;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <PageLayout
      title={t('departments.title')}
      description={t('departments.description')}
      actions={<Button onClick={() => setDialog({ kind: 'add' })}>{t('departments.add')}</Button>}
    >
      {departments.error ? <Alert tone="danger">{errorMessage(departments.error)}</Alert> : null}
      {departments.isPending ? <Skeleton className="h-40" /> : null}
      {departments.data?.length === 0 ? (
        <p className="text-sm text-text-muted">{t('departments.empty')}</p>
      ) : null}
      {departments.data && departments.data.length > 0 ? (
        <div className={TABLE_FRAME}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('departments.columnCode')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('departments.columnName')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('departments.columnStatus')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-end`}>
                  {t('departments.columnActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.data.map((department) => (
                <tr key={department.departmentId} className={ROW}>
                  <td className={`${CELL} font-mono`}>{department.code}</td>
                  <td className={CELL}>
                    <DepartmentNames department={department} />
                  </td>
                  <td className={CELL}>
                    {department.active ? (
                      <StatusBadge
                        size="sm"
                        status="active"
                        label={t('departments.statusActive')}
                      />
                    ) : (
                      <StatusBadge
                        size="sm"
                        status="idle"
                        label={t('departments.statusInactive')}
                      />
                    )}
                  </td>
                  <td className={`${CELL} text-end`}>
                    <IconButton
                      icon="pencil"
                      label={`${t('departments.edit')}: ${department.code}`}
                      variant="secondary"
                      onClick={() =>
                        setDialog({ kind: 'edit', departmentId: department.departmentId })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {dialog?.kind === 'add' ? <DepartmentDialog onOpenChange={close} /> : null}
      {editing ? (
        <DepartmentDialog
          key={`${editing.departmentId}:${editing.version}`}
          department={editing}
          onOpenChange={close}
        />
      ) : null}
    </PageLayout>
  );
}
