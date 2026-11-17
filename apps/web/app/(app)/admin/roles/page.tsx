'use client';
// SCR-22 (roles): the hospital's roles as a table with member and permission counts; each role
// opens its own permissions page, and new roles start from the product templates (T-ACC-05;
// FR-ACC-008; C-045). admin.role.manage; the API enforces it.
import { buttonClassName, Icon, iconButtonClassName, PageLayout } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  CELL,
  CODE_CHIP,
  HEAD_CELL,
  ROW,
  ROW_TITLE,
  TABLE,
  TABLE_FRAME,
} from '../../../../src/components/admin/admin-table';
import { ROLES_PATH, useRoles } from '../../../../src/components/admin/role-editor';
import { QueryView } from '../../../../src/components/query-view';

export default function RolesPage() {
  const t = useTranslations();
  const roles = useRoles();
  const templateName = new Map(roles.data?.templates.map((item) => [item.code, item.nameEn]));

  return (
    <PageLayout
      title={t('admin.rolesTitle')}
      description={t('admin.rolesDescription')}
      actions={
        <Link href={`${ROLES_PATH}/new`} className={buttonClassName()}>
          {t('admin.addRole')}
        </Link>
      }
    >
      {/* The hospital administrator role always exists, so the list is never empty. */}
      <QueryView query={roles} columns={5}>
        {(data) => (
          <div className={TABLE_FRAME}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('admin.role')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-start`}>
                    {t('admin.template')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-end`}>
                    {t('admin.membersColumn')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-end`}>
                    {t('admin.permissions')}
                  </th>
                  <th scope="col" className={`${HEAD_CELL} text-end`}>
                    {t('admin.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.roles.map((role) => (
                  <tr key={role.id} className={ROW}>
                    <td className={CELL}>
                      <p className={ROW_TITLE}>{role.nameEn}</p>
                      <span className={CODE_CHIP}>{role.code}</span>
                    </td>
                    <td className={`${CELL} text-text-muted`} data-label={t('admin.template')}>
                      {role.templateCode
                        ? (templateName.get(role.templateCode) ?? role.templateCode)
                        : t('admin.noTemplate')}
                    </td>
                    <td
                      className={`${CELL} text-end tabular-nums`}
                      data-label={t('admin.membersColumn')}
                    >
                      {role.memberCount}
                    </td>
                    <td
                      className={`${CELL} text-end tabular-nums`}
                      data-label={t('admin.permissions')}
                    >
                      {role.permissions.length}
                    </td>
                    <td className={`${CELL} text-end`} data-cell="actions">
                      {/* An icon link, not a button: it opens the role's own page. */}
                      <Link
                        href={`${ROLES_PATH}/${role.id}`}
                        aria-label={`${t('admin.editPermissions')}: ${role.nameEn}`}
                        title={t('admin.editPermissions')}
                        className={`${iconButtonClassName('secondary')} ms-auto`}
                      >
                        <Icon name="pencil" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryView>
    </PageLayout>
  );
}
