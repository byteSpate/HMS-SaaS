'use client';
// SCR-22 (new role): create a role, usually from one of the product templates (T-ACC-05;
// FR-ACC-008; C-045). admin.role.manage; the API enforces it.
import { Alert, PageLayout, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { RoleEditor, useRoles } from '../../../../../src/components/admin/role-editor';
import { useApiErrorMessage } from '../../../../../src/i18n/use-api-error-message';

export default function NewRolePage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const roles = useRoles();

  if (roles.data) return <RoleEditor templates={roles.data.templates} />;
  return (
    <PageLayout title={t('admin.addRole')}>
      {roles.error ? <Alert tone="danger">{errorMessage(roles.error)}</Alert> : null}
      {roles.isPending ? <Skeleton className="h-40" /> : null}
    </PageLayout>
  );
}
