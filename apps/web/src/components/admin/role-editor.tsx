'use client';
// Role page body (T-ACC-05; FR-ACC-008; C-045): create a role, usually from one of the nine
// product templates, or replace a role's permissions. A page rather than a dialog, so the whole
// catalogue has room. The API refuses removing user or role administration from a role the
// administrator holds.
import type { AdminRole, PermissionCode, RoleTemplateSummary } from '@hms/contracts';
import {
  Alert,
  Button,
  buttonClassName,
  Field,
  Icon,
  iconButtonClassName,
  PageLayout,
  Select,
  TextInput,
  useToast,
} from '@hms/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminApi } from '../../api/admin';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { PermissionSections } from './permission-sections';

export const ROLES_QUERY_KEY = ['admin', 'roles'] as const;
export const ROLES_PATH = '/admin/roles';

/** The hospital's roles and the product templates, shared by the role list and role pages. */
export function useRoles() {
  return useQuery({ queryKey: ROLES_QUERY_KEY, queryFn: adminApi.roles });
}

function sameCodes(a: ReadonlySet<PermissionCode>, b: ReadonlySet<PermissionCode>): boolean {
  return a.size === b.size && [...a].every((code) => b.has(code));
}

export function RoleEditor({
  role,
  templates,
}: {
  /** Edit this role's permissions; omitted to create a new role. */
  role?: AdminRole;
  templates: readonly RoleTemplateSummary[];
}) {
  const t = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [templateCode, setTemplateCode] = useState('');
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [permissions, setPermissions] = useState<Set<PermissionCode>>(
    new Set(role?.permissions ?? []),
  );
  const unchanged = role ? sameCodes(new Set(role.permissions), permissions) : false;

  const save = useMutation({
    mutationFn: () =>
      role
        ? adminApi.setPermissions(role.id, [...permissions])
        : adminApi.createRole({
            code,
            nameEn,
            ...(nameBn ? { nameBn } : {}),
            ...(templateCode ? { templateCode } : {}),
            permissions: [...permissions],
          }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY });
      toast.show({ title: t('admin.saved'), tone: 'success' });
      router.push(ROLES_PATH);
    },
  });

  function chooseTemplate(value: string): void {
    setTemplateCode(value);
    const template = templates.find((item) => item.code === value);
    if (!template) return;
    setCode(template.code);
    setNameEn(template.nameEn);
    setPermissions(new Set(template.permissions));
  }

  return (
    <PageLayout
      title={role ? t('admin.rolePermissionsTitle') : t('admin.addRole')}
      description={role ? t('admin.rolePermissionsDescription') : t('admin.newRoleDescription')}
      actions={
        <>
          <Link href={ROLES_PATH} className={buttonClassName('secondary')}>
            {t('admin.cancel')}
          </Link>
          <Button loading={save.isPending} disabled={unchanged} onClick={() => save.mutate()}>
            {role ? t('admin.savePermissions') : t('admin.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {save.error ? <Alert tone="danger">{errorMessage(save.error)}</Alert> : null}

        <div className="flex items-start gap-3 rounded-panel border border-border bg-surface p-4">
          <Link
            href={ROLES_PATH}
            aria-label={t('admin.backToRoles')}
            className={iconButtonClassName('secondary')}
          >
            <Icon name="caret-left" />
          </Link>
          {role ? (
            <div className="min-w-0">
              <p className="font-medium">
                {role.nameEn} <span className="font-mono text-sm text-text-muted">{role.code}</span>
              </p>
              <p className="text-sm text-text-muted">
                {t('admin.members', { count: role.memberCount })},{' '}
                {t('admin.permissionCount', { count: permissions.size })}
              </p>
            </div>
          ) : (
            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label={t('admin.fromTemplate')}>
                {({ id, ...aria }) => (
                  <Select
                    id={id}
                    value={templateCode}
                    onChange={(event) => chooseTemplate(event.target.value)}
                    options={[
                      { value: '', label: t('admin.noTemplate') },
                      ...templates.map((item) => ({ value: item.code, label: item.nameEn })),
                    ]}
                    {...aria}
                  />
                )}
              </Field>
              <Field label={t('admin.roleCode')} hint={t('admin.roleCodeHint')} required>
                {({ id, invalid, required, ...aria }) => (
                  <TextInput
                    id={id}
                    value={code}
                    invalid={invalid}
                    required={required}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    {...aria}
                  />
                )}
              </Field>
              <Field label={t('admin.roleName')} required>
                {({ id, invalid, required, ...aria }) => (
                  <TextInput
                    id={id}
                    value={nameEn}
                    invalid={invalid}
                    required={required}
                    onChange={(event) => setNameEn(event.target.value)}
                    {...aria}
                  />
                )}
              </Field>
              <Field label={t('admin.roleNameBn')}>
                {({ id, ...aria }) => (
                  <TextInput
                    id={id}
                    value={nameBn}
                    onChange={(event) => setNameBn(event.target.value)}
                    {...aria}
                  />
                )}
              </Field>
            </div>
          )}
        </div>

        <PermissionSections selected={permissions} onChange={setPermissions} />
      </div>
    </PageLayout>
  );
}
