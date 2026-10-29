'use client';
// SCR-22 (role permissions): replace one role's permissions on its own page (T-ACC-05;
// FR-ACC-008). admin.role.manage; the API enforces it and keeps an administrator from removing
// user or role administration from a role they hold.
import { Alert, PageLayout, Skeleton } from '@hms/ui';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RoleEditor, useRoles } from '../../../../../src/components/admin/role-editor';
import { useApiErrorMessage } from '../../../../../src/i18n/use-api-error-message';

export default function RolePermissionsPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const { roleId } = useParams<{ roleId: string }>();
  const roles = useRoles();
  const role = roles.data?.roles.find((item) => item.id === roleId);

  if (roles.data && role) {
    return <RoleEditor key={role.id} role={role} templates={roles.data.templates} />;
  }
  return (
    <PageLayout title={t('admin.rolePermissionsTitle')}>
      {roles.error ? <Alert tone="danger">{errorMessage(roles.error)}</Alert> : null}
      {roles.isPending ? <Skeleton className="h-40" /> : null}
      {roles.data && !role ? <Alert tone="danger">{t('admin.roleNotFound')}</Alert> : null}
    </PageLayout>
  );
}
