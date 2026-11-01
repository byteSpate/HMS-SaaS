'use client';
// Add a staff user with a temporary password and roles (T-ACC-05; FR-ACC-007, FR-ACC-008). The
// person must replace the password at first sign-in; the API enforces the minimums.
import { PASSWORD_MIN_LENGTH, type RoleSummary } from '@hms/contracts';
import { Alert, Button, Dialog, Field, PasswordInput, TextInput, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminApi } from '../../api/admin';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { RoleChoices } from './role-choices';

export const USERS_QUERY_KEY = ['admin', 'users'] as const;

export function UserCreateDialog({
  roles,
  onOpenChange,
}: {
  roles: readonly RoleSummary[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());

  const create = useMutation({
    mutationFn: () =>
      adminApi.createUser({ username, displayName, temporaryPassword, roleIds: [...roleIds] }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.show({ title: t('admin.saved'), tone: 'success' });
      onOpenChange(false);
    },
  });

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('admin.addUser')}
      footer={
        <Button loading={create.isPending} onClick={() => create.mutate()}>
          {t('admin.create')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {create.error ? <Alert tone="danger">{errorMessage(create.error)}</Alert> : null}
        <Field label={t('admin.username')} required>
          {({ id, invalid, required, ...aria }) => (
            <TextInput
              id={id}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              invalid={invalid}
              required={required}
              onChange={(event) => setUsername(event.target.value)}
              {...aria}
            />
          )}
        </Field>
        <Field label={t('admin.displayName')} required>
          {({ id, invalid, required, ...aria }) => (
            <TextInput
              id={id}
              value={displayName}
              invalid={invalid}
              required={required}
              onChange={(event) => setDisplayName(event.target.value)}
              {...aria}
            />
          )}
        </Field>
        <Field
          label={t('admin.temporaryPasswordLabel')}
          hint={t('admin.temporaryPasswordHint')}
          required
        >
          {({ id, invalid, required, ...aria }) => (
            <PasswordInput
              id={id}
              showLabel={t('common.showSecret')}
              hideLabel={t('common.hideSecret')}
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              value={temporaryPassword}
              invalid={invalid}
              required={required}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              {...aria}
            />
          )}
        </Field>
        <RoleChoices
          roles={roles}
          selected={roleIds}
          onChange={setRoleIds}
          label={t('admin.roles')}
          emptyLabel={t('admin.noRoles')}
        />
      </div>
    </Dialog>
  );
}
