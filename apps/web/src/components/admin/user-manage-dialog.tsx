'use client';
// Manage one staff user (T-ACC-05; FR-ACC-007, FR-ACC-008, FR-ACC-010; T-ACC-03 locks): roles,
// access to this hospital, temporary password, account lock and second-factor reset. Every action
// except a role change needs a reason, which the API keeps in the audit trail. Revoking access or
// locking ends the person's open sessions at once.
import type { AdminUser, RoleSummary } from '@hms/contracts';
import { formatDateTime, type Locale } from '@hms/i18n';
import { Alert, Button, Dialog, Field, PasswordInput, TextInput, useToast } from '@hms/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { adminApi } from '../../api/admin';
import { useApiErrorMessage } from '../../i18n/use-api-error-message';
import { RoleChoices } from './role-choices';
import { USERS_QUERY_KEY } from './user-create-dialog';

type Action =
  | { kind: 'roles' }
  | { kind: 'membership'; status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' }
  | { kind: 'password' }
  | { kind: 'lock' }
  | { kind: 'unlock' }
  | { kind: 'mfa' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
}

export function UserManageDialog({
  user,
  roles,
  onOpenChange,
}: {
  user: AdminUser;
  roles: readonly RoleSummary[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set(user.roles.map((r) => r.id)));
  const [reason, setReason] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');

  const act = useMutation({
    mutationFn: (action: Action): Promise<unknown> => {
      switch (action.kind) {
        case 'roles':
          return adminApi.setRoles(user.userId, [...roleIds]);
        case 'membership':
          return adminApi.setMembershipStatus(user.userId, { status: action.status, reason });
        case 'password':
          return adminApi.resetPassword(user.userId, temporaryPassword, reason);
        case 'lock':
          return adminApi.lock(user.userId, reason);
        case 'unlock':
          return adminApi.unlock(user.userId, reason);
        case 'mfa':
          return adminApi.resetMfa(user.userId, reason);
      }
    },
    onSuccess: async () => {
      setReason('');
      setTemporaryPassword('');
      await queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.show({ title: t('admin.saved'), tone: 'success' });
    },
  });

  const locked = user.accountStatus === 'LOCKED_ADMIN' || user.accountStatus === 'LOCKED_TEMPORARY';
  const revoked = user.membershipStatus === 'REVOKED';
  const pending = act.isPending;

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      size="lg"
      closeLabel={t('common.close')}
      title={t('admin.manageTitle', { name: user.displayName })}
      description={user.username}
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Alert tone="danger">{errorMessage(act.error)}</Alert> : null}

        <Section title={t('admin.rolesSection')}>
          <RoleChoices
            roles={roles}
            selected={roleIds}
            onChange={setRoleIds}
            label={t('admin.roles')}
            emptyLabel={t('admin.noRoles')}
          />
          <Button
            variant="secondary"
            className="self-start"
            disabled={revoked || pending}
            onClick={() => act.mutate({ kind: 'roles' })}
          >
            {t('admin.saveRoles')}
          </Button>
        </Section>

        <Field label={t('admin.reason')} hint={t('admin.reasonHint')}>
          {({ id, ...aria }) => (
            <TextInput
              id={id}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              {...aria}
            />
          )}
        </Field>

        <Section title={t('admin.accessSection')}>
          <div className="flex flex-wrap gap-2">
            {user.membershipStatus === 'ACTIVE' ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => act.mutate({ kind: 'membership', status: 'SUSPENDED' })}
              >
                {t('admin.suspend')}
              </Button>
            ) : null}
            {user.membershipStatus === 'SUSPENDED' ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => act.mutate({ kind: 'membership', status: 'ACTIVE' })}
              >
                {t('admin.reactivate')}
              </Button>
            ) : null}
            {revoked ? null : (
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => act.mutate({ kind: 'membership', status: 'REVOKED' })}
              >
                {t('admin.revoke')}
              </Button>
            )}
          </div>
        </Section>

        <Section title={t('admin.credentialSection')}>
          <Field label={t('admin.temporaryPasswordLabel')} hint={t('admin.temporaryPasswordHint')}>
            {({ id, ...aria }) => (
              <PasswordInput
                id={id}
                showLabel={t('common.showSecret')}
                hideLabel={t('common.hideSecret')}
                autoComplete="new-password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                {...aria}
              />
            )}
          </Field>
          <Button
            variant="secondary"
            className="self-start"
            disabled={revoked || pending}
            onClick={() => act.mutate({ kind: 'password' })}
          >
            {t('admin.resetPassword')}
          </Button>
        </Section>

        <Section title={t('admin.lockSection')}>
          {user.lockedUntil ? (
            <p className="text-text-muted">
              {t('admin.lockedUntil', { time: formatDateTime(user.lockedUntil, locale) })}
            </p>
          ) : null}
          <Button
            variant="secondary"
            className="self-start"
            disabled={pending}
            onClick={() => act.mutate({ kind: locked ? 'unlock' : 'lock' })}
          >
            {locked ? t('admin.unlock') : t('admin.lock')}
          </Button>
        </Section>

        <Section title={t('admin.mfaSection')}>
          {user.mfaEnrolled ? (
            <Button
              variant="secondary"
              className="self-start"
              disabled={pending}
              onClick={() => act.mutate({ kind: 'mfa' })}
            >
              {t('admin.resetMfa')}
            </Button>
          ) : (
            <p className="text-text-muted">{t('admin.mfaNotSet')}</p>
          )}
        </Section>
      </div>
    </Dialog>
  );
}
