'use client';
// SCR-22 (users): the hospital's staff accounts as a table with their roles and access state; add a user
// with a temporary password, and manage one (T-ACC-05; FR-ACC-007, FR-ACC-008, FR-ACC-010).
// admin.user.manage; the API enforces it.
import type { AdminUser } from '@hms/contracts';
import { Alert, Button, PageLayout, Skeleton, StatusBadge, type StatusKind } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminApi } from '../../../../src/api/admin';
import {
  USERS_QUERY_KEY,
  UserCreateDialog,
} from '../../../../src/components/admin/user-create-dialog';
import { UserManageDialog } from '../../../../src/components/admin/user-manage-dialog';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';

// Full catalog keys as literals, so the unused-key check can see them.
const MEMBERSHIP_BADGE = {
  ACTIVE: { status: 'active', labelKey: 'admin.membershipActive' },
  SUSPENDED: { status: 'attention', labelKey: 'admin.membershipSuspended' },
  REVOKED: { status: 'problem', labelKey: 'admin.membershipRevoked' },
  INVITED: { status: 'idle', labelKey: 'admin.membershipInvited' },
} as const satisfies Record<
  AdminUser['membershipStatus'],
  { status: StatusKind; labelKey: string }
>;

export default function UsersPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const users = useQuery({ queryKey: USERS_QUERY_KEY, queryFn: adminApi.users });
  const [creating, setCreating] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);
  const roles = users.data?.roles ?? [];
  const managing = users.data?.users.find((user) => user.userId === managingId);

  return (
    <PageLayout
      title={t('admin.usersTitle')}
      description={t('admin.usersDescription')}
      actions={<Button onClick={() => setCreating(true)}>{t('admin.addUser')}</Button>}
    >
      {users.error ? <Alert tone="danger">{errorMessage(users.error)}</Alert> : null}
      {users.isPending ? <Skeleton className="h-40" /> : null}
      {users.data ? (
        <div className="overflow-x-auto rounded-panel border border-border bg-surface">
          <table className="w-full min-w-2xl text-start">
            <thead className="text-sm text-text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('admin.user')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('admin.roles')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t('admin.status')}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  {t('admin.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.users.map((user) => {
                const badge = MEMBERSHIP_BADGE[user.membershipStatus];
                const locked = user.accountStatus !== 'ACTIVE' && user.accountStatus !== 'DISABLED';
                return (
                  <tr key={user.userId} className="border-t border-border hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <p className="font-medium">{user.displayName}</p>
                      <p className="font-mono text-sm text-text-muted">{user.username}</p>
                    </td>
                    <td className="px-4 py-3">
                      {user.roles.length > 0 ? (
                        <ul className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <li
                              key={role.id}
                              title={role.nameEn}
                              className="rounded-pill bg-primary-soft px-2 font-mono text-sm text-primary"
                            >
                              {role.code}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-text-muted">{t('admin.noRoles')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status={badge.status} label={t(badge.labelKey)} />
                        {locked ? <StatusBadge status="problem" label={t('admin.locked')} /> : null}
                        {user.mfaEnrolled ? (
                          <StatusBadge status="done" label={t('admin.mfaOn')} />
                        ) : null}
                        {user.mustChangePassword ? (
                          <StatusBadge status="review" label={t('admin.mustChange')} />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button
                        variant="secondary"
                        aria-label={`${t('admin.manage')}: ${user.displayName}`}
                        onClick={() => setManagingId(user.userId)}
                      >
                        {t('admin.manage')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {creating ? <UserCreateDialog roles={roles} onOpenChange={setCreating} /> : null}
      {managing ? (
        <UserManageDialog
          key={managing.userId}
          user={managing}
          roles={roles}
          onOpenChange={(open) => setManagingId(open ? managing.userId : null)}
        />
      ) : null}
    </PageLayout>
  );
}
