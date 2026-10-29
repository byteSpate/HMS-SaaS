'use client';
// Read-only view of one staff user (T-ACC-05; SCR-22): identity, roles, access to this hospital,
// account lock, second factor and password state. Changes happen in the Manage dialog, which the
// footer opens.
import type { AdminUser } from '@hms/contracts';
import { formatDateTime, type Locale } from '@hms/i18n';
import { Button, Dialog, StatusBadge, type StatusKind } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { CODE_CHIP } from './admin-table';
import { initial, isLocked, MEMBERSHIP_BADGE } from './user-status';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border py-3 sm:grid-cols-3">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}

export function UserDetailsDialog({
  user,
  onOpenChange,
  onManage,
}: {
  user: AdminUser;
  onOpenChange: (open: boolean) => void;
  onManage: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const badge = MEMBERSHIP_BADGE[user.membershipStatus];
  const account = accountBadge();

  function accountBadge(): { status: StatusKind; label: string } {
    if (isLocked(user)) {
      const label = user.lockedUntil
        ? t('admin.lockedUntil', { time: formatDateTime(user.lockedUntil, locale) })
        : t('admin.locked');
      return { status: 'problem', label };
    }
    if (user.accountStatus === 'DISABLED') {
      return { status: 'idle', label: t('admin.accountDisabled') };
    }
    return { status: 'done', label: t('admin.accountActive') };
  }

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      closeLabel={t('common.close')}
      title={t('admin.detailsTitle')}
      footer={
        <Button variant="secondary" onClick={onManage}>
          {t('admin.manage')}
        </Button>
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-on-primary"
        >
          {initial(user.displayName)}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{user.displayName}</p>
          <p className="text-sm text-text-muted">{user.username}</p>
        </div>
      </div>
      <dl>
        <Detail label={t('admin.username')}>{user.username}</Detail>
        <Detail label={t('admin.displayName')}>{user.displayName}</Detail>
        <Detail label={t('admin.rolesSection')}>
          {user.roles.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {user.roles.map((role) => (
                <li key={role.id} className="flex items-center gap-2">
                  <span className={CODE_CHIP}>{role.code}</span>
                  {role.nameEn}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-text-muted">{t('admin.noRoles')}</span>
          )}
        </Detail>
        <Detail label={t('admin.accessSection')}>
          <StatusBadge status={badge.status} label={t(badge.labelKey)} />
        </Detail>
        <Detail label={t('admin.accountSection')}>
          <StatusBadge status={account.status} label={account.label} />
        </Detail>
        <Detail label={t('admin.mfaSection')}>
          {user.mfaEnrolled ? (
            <StatusBadge status="done" label={t('admin.mfaOn')} />
          ) : (
            <span className="text-text-muted">{t('admin.mfaNotSet')}</span>
          )}
        </Detail>
        <Detail label={t('admin.credentialSection')}>
          {user.mustChangePassword ? (
            <StatusBadge status="review" label={t('admin.mustChange')} />
          ) : (
            <span className="text-text-muted">{t('admin.passwordSet')}</span>
          )}
        </Detail>
      </dl>
    </Dialog>
  );
}
