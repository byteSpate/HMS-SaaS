'use client';
// Account menu in the top bar: change password and sign out (one hospital per account, T-ACC-06).
// Signing out is confirmed by the server before the screen changes, so a failed request
// never looks like a completed logout on a shared workstation. Implements: T-UI-02, FR-ACC-004.
import type { SessionResponse } from '@hms/contracts';
import { Button, Icon, Menu, useToast } from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useApiErrorMessage } from '../i18n/use-api-error-message';
import { useSessionActions } from '../session/use-session';

export function UserMenu({ session }: { session: SessionResponse }) {
  const t = useTranslations();
  const router = useRouter();
  const toast = useToast();
  const errorMessage = useApiErrorMessage();
  const { logout } = useSessionActions();

  const items = [
    // T-ACC-05 (FR-ACC-007): anyone may change their own password at any time.
    {
      id: 'change-password',
      label: t('changePassword.title'),
      onSelect: () => router.push('/change-password'),
    },
    {
      id: 'sign-out',
      label: t('common.signOut'),
      onSelect: () =>
        logout.mutate(undefined, {
          onSuccess: () => router.replace('/login'),
          onError: (error) => toast.show({ title: errorMessage(error), tone: 'danger' }),
        }),
    },
  ];

  return (
    <Menu
      menuLabel={t('shell.signedInAs', { name: session.user.displayName })}
      items={items}
      trigger={(props) => (
        <Button variant="ghost" aria-label={t('shell.userMenu')} {...props}>
          <Icon name="user" />
          <span className="hidden max-w-40 truncate sm:inline">{session.user.displayName}</span>
        </Button>
      )}
    />
  );
}
