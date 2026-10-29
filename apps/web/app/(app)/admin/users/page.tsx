'use client';
// SCR-22 (users): the hospital's staff accounts as a table with their roles and access state;
// add a user with a temporary password, view one, manage one, or remove one from the hospital
// (T-ACC-05; FR-ACC-007, FR-ACC-008, FR-ACC-010). admin.user.manage; the API enforces it.
import { Alert, Button, IconButton, PageLayout, Skeleton, StatusBadge } from '@hms/ui';
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
import { UserDetailsDialog } from '../../../../src/components/admin/user-details-dialog';
import { UserManageDialog } from '../../../../src/components/admin/user-manage-dialog';
import { UserRemoveDialog } from '../../../../src/components/admin/user-remove-dialog';
import { initial, isLocked, MEMBERSHIP_BADGE } from '../../../../src/components/admin/user-status';
import { useApiErrorMessage } from '../../../../src/i18n/use-api-error-message';

/** One dialog at a time, for one user. */
type OpenDialog = { kind: 'details' | 'manage' | 'remove'; userId: string } | null;

export default function UsersPage() {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const users = useQuery({ queryKey: USERS_QUERY_KEY, queryFn: adminApi.users });
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const roles = users.data?.roles ?? [];
  const selected = users.data?.users.find((user) => user.userId === dialog?.userId);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

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
                const revoked = user.membershipStatus === 'REVOKED';
                const open = (kind: 'details' | 'manage' | 'remove') =>
                  setDialog({ kind, userId: user.userId });
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
                        {isLocked(user) ? (
                          <StatusBadge status="problem" label={t('admin.locked')} />
                        ) : null}
                        {user.mfaEnrolled ? (
                          <StatusBadge status="done" label={t('admin.mfaOn')} />
                        ) : null}
                        {user.mustChangePassword ? (
                          <StatusBadge status="review" label={t('admin.mustChange')} />
                        ) : null}
                      </div>
                    </td>
                    <td className={CELL}>
                      <div className="flex justify-end gap-1.5">
                        <IconButton
                          icon="eye"
                          label={`${t('admin.viewDetails')}: ${user.displayName}`}
                          variant="secondary"
                          onClick={() => open('details')}
                        />
                        <IconButton
                          icon="more"
                          label={`${t('admin.manage')}: ${user.displayName}`}
                          variant="secondary"
                          onClick={() => open('manage')}
                        />
                        {/* Removing is final, so the button is disabled for a removed person. */}
                        <IconButton
                          icon="trash"
                          label={`${t('admin.remove')}: ${user.displayName}`}
                          variant="secondary"
                          disabled={revoked}
                          onClick={() => open('remove')}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {creating ? <UserCreateDialog roles={roles} onOpenChange={setCreating} /> : null}
      {selected && dialog?.kind === 'details' ? (
        <UserDetailsDialog
          key={selected.userId}
          user={selected}
          onOpenChange={close}
          onManage={() => setDialog({ kind: 'manage', userId: selected.userId })}
        />
      ) : null}
      {selected && dialog?.kind === 'manage' ? (
        <UserManageDialog
          key={selected.userId}
          user={selected}
          roles={roles}
          onOpenChange={close}
        />
      ) : null}
      {selected && dialog?.kind === 'remove' ? (
        <UserRemoveDialog key={selected.userId} user={selected} onOpenChange={close} />
      ) : null}
    </PageLayout>
  );
}
