'use client';
// SCR-22 (users): the hospital's staff accounts as a table with their roles and access state;
// add a user with a temporary password, and manage one (T-ACC-05; FR-ACC-007, FR-ACC-008,
// FR-ACC-010). admin.user.manage; the API enforces it.
import type { AdminUser } from '@hms/contracts';
import {
  Alert,
  Button,
  IconButton,
  PageLayout,
  Skeleton,
  StatusBadge,
  type StatusKind,
} from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { adminApi } from '../../../../src/api/admin';
import {
  CELL,
  CODE_CHIP,
  HEAD_CELL,
  ROW,
  TABLE,
  TABLE_FRAME,
} from '../../../../src/components/admin/admin-table';
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

/** First letter of the name for the avatar; works for Bangla and Latin names alike. */
function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?';
}

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
        <div className={TABLE_FRAME}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('admin.user')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('admin.roles')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-start`}>
                  {t('admin.status')}
                </th>
                <th scope="col" className={`${HEAD_CELL} text-end`}>
                  {t('admin.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.users.map((user) => {
                const badge = MEMBERSHIP_BADGE[user.membershipStatus];
                const locked = user.accountStatus !== 'ACTIVE' && user.accountStatus !== 'DISABLED';
                return (
                  <tr key={user.userId} className={ROW}>
                    <td className={CELL}>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-on-primary"
                        >
                          {initial(user.displayName)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{user.displayName}</p>
                          <p className="text-xs text-text-muted">{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className={CELL}>
                      {user.roles.length > 0 ? (
                        <ul className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <li key={role.id} title={role.nameEn} className={CODE_CHIP}>
                              {role.code}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-text-muted">{t('admin.noRoles')}</span>
                      )}
                    </td>
                    <td className={CELL}>
                      <div className="flex flex-wrap gap-1.5">
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
                    <td className={`${CELL} text-end`}>
                      <IconButton
                        icon="more"
                        label={`${t('admin.manage')}: ${user.displayName}`}
                        variant="secondary"
                        onClick={() => setManagingId(user.userId)}
                      />
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
