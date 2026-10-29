'use client';
// SCR-22 (roles): the hospital's roles as a table with member and permission counts; each role
// opens its own permissions page, and new roles start from the product templates (T-ACC-05;
// FR-ACC-008; C-045). admin.role.manage; the API enforces it.
import { Alert, buttonClassName, PageLayout, Skeleton } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ROLES_PATH, useRoles } from '../../../../src/components/admin/role-editor';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';

export default function RolesPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const roles = useRoles();
  const templateName = new Map(roles.data?.templates.map((item) => [item.code, item.nameEn]));

  return (
    <PageLayout
      title={t('admin.rolesTitle')}
      description={t('admin.rolesDescription')}
      actions={
        <Link href={`${ROLES_PATH}/new`} className={buttonClassName()}>
          {t('admin.addRole')}
        </Link>
      }
    >
      {roles.error ? <Alert tone="danger">{errorMessage(roles.error)}</Alert> : null}
      {roles.isPending ? <Skeleton className="h-40" /> : null}
      {roles.data ? (
        <div className="overflow-x-auto rounded-panel border border-border bg-surface">
          <table className="w-full min-w-2xl text-start">
            <thead className="text-sm text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('admin.role')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('admin.template')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  {t('admin.membersColumn')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  {t('admin.permissions')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  {t('admin.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.data.roles.map((role) => (
                <tr key={role.id} className="border-t border-border hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <p className="font-medium">{role.nameEn}</p>
                    <p className="font-mono text-sm text-text-muted">{role.code}</p>
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {role.templateCode
                      ? (templateName.get(role.templateCode) ?? role.templateCode)
                      : t('admin.noTemplate')}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">{role.memberCount}</td>
                  <td className="px-4 py-3 text-end tabular-nums">{role.permissions.length}</td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`${ROLES_PATH}/${role.id}`}
                      aria-label={`${t('admin.editPermissions')}: ${role.nameEn}`}
                      className={buttonClassName('secondary')}
                    >
                      {t('admin.editPermissions')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PageLayout>
  );
}
