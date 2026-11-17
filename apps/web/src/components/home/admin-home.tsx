'use client';
// The hospital administrator's home (Role Home v2 design, role "admin"): how far the hospital's
// setup has come (departments, practitioners, this week's doctor sessions, doctor fees in force,
// staff accounts), user, role and practitioner counts, and the latest audit events. Every step
// and tile reads only with its own permission, so a partial administrator sees a shorter list
// (FR-ACC-009). Implements: T-UI-03, FR-CFG-001, FR-AUD-005.
import { formatDateTime, type Locale } from '@hms/i18n';
import { buttonClassName, StatusBadge, WorkPanel } from '@hms/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { auditApi } from '../../api/audit';
import { adminApi } from '../../api/admin';
import { DEPARTMENTS_QUERY_KEY, departmentsApi } from '../../api/departments';
import { PRACTITIONERS_QUERY_KEY, practitionersApi } from '../../api/practitioners';
import { PRICE_LISTS_QUERY_KEY, priceListsApi } from '../../api/price-lists';
import { SCHEDULE_SESSIONS_QUERY_KEY, scheduleSessionsApi } from '../../api/schedule-sessions';
import { CELL, CODE_CHIP, HEAD_CELL, ROW, PANEL_TABLE } from '../admin/admin-table';
import { useRoles } from '../admin/role-editor';
import { USERS_QUERY_KEY } from '../admin/user-create-dialog';
import { QueryView } from '../query-view';
import { addDays, hospitalToday } from '../schedules/session-form';
import { type SetupStep, setupProgress } from './home-rules';
import { HomeTile, TileRow, tileState, useDigits, ViewAllLink } from './home-parts';

// Full catalog keys as literals, so the unused-key check can see them.
const STEP_TEXT = {
  departments: { labelKey: 'home.stepDepartments', href: '/admin/departments' },
  practitioners: { labelKey: 'home.stepPractitioners', href: '/admin/practitioners' },
  sessions: { labelKey: 'home.stepSessions', href: '/schedules' },
  fees: { labelKey: 'home.stepFees', href: '/admin/doctor-fees' },
  users: { labelKey: 'home.stepUsers', href: '/admin/users' },
} as const satisfies Record<SetupStep['id'], { labelKey: string; href: string }>;

interface StepRow extends SetupStep {
  /** How many were added; null while the list is still loading. */
  count: number | null;
  failed: boolean;
}

function SetupChecklist({ steps }: { steps: StepRow[] }) {
  const t = useTranslations();
  const digits = useDigits();
  const { done, total } = setupProgress(steps);
  return (
    <>
      {/* The text carries the progress; the bar only repeats it for the eye. */}
      <div aria-hidden="true" className="flex gap-1 px-4 pt-3">
        {steps.map((step) => (
          <span
            key={step.id}
            className={`h-1.5 flex-1 rounded-pill ${step.done ? 'bg-status-done-text' : 'bg-border'}`}
          />
        ))}
      </div>
      <p className="px-4 pt-1 text-xs text-text-muted">
        {t('home.kpiSetupValue', { done: digits(done), total: digits(total) })}
      </p>
      <table className={PANEL_TABLE}>
        <tbody>
          {steps.map((step) => (
            <tr key={step.id} className={ROW}>
              <td className={CELL}>
                <span className="text-[0.8125rem] font-medium">
                  {t(STEP_TEXT[step.id].labelKey)}
                </span>
              </td>
              <td className={`${CELL} text-text-muted`}>
                {step.count === null ? '-' : t('home.stepCount', { count: digits(step.count) })}
              </td>
              <td className={CELL}>
                {step.failed ? (
                  <StatusBadge size="sm" status="problem" label={t('home.tileError')} />
                ) : (
                  <StatusBadge
                    size="sm"
                    status={step.done ? 'done' : 'idle'}
                    label={step.done ? t('home.stepDone') : t('home.stepTodo')}
                  />
                )}
              </td>
              <td className={`${CELL} text-end`} data-cell="actions">
                <Link
                  href={STEP_TEXT[step.id].href}
                  className={buttonClassName(step.done ? 'secondary' : 'primary')}
                >
                  {step.done ? t('home.stepOpen') : t('home.stepStart')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function RecentActivity() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  // Its own key: the audit screen keeps an infinite query under ['audit-events', filters].
  const events = useQuery({
    queryKey: ['audit-events', 'home'],
    queryFn: () => auditApi.search({}),
  });
  return (
    <QueryView
      query={events}
      inPanel
      columns={3}
      isEmpty={(page) => page.items.length === 0}
      empty={{ title: t('admin.auditEmpty') }}
    >
      {(page) => (
        <table className={PANEL_TABLE}>
          <thead>
            <tr>
              <th scope="col" className={`${HEAD_CELL} text-start`}>
                {t('admin.auditWhen')}
              </th>
              <th scope="col" className={`${HEAD_CELL} text-start`}>
                {t('admin.auditActor')}
              </th>
              <th scope="col" className={`${HEAD_CELL} text-start`}>
                {t('admin.auditAction')}
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.slice(0, 6).map((row) => (
              <tr key={row.id} className={ROW}>
                <td className={`${CELL} tabular-nums`}>
                  {formatDateTime(new Date(row.occurredAt), locale)}
                </td>
                <td className={CELL} data-label={t('admin.auditActor')}>
                  {row.actorName ?? t('admin.auditSystem')}
                </td>
                <td className={CELL} data-label={t('admin.auditAction')}>
                  <span className={CODE_CHIP}>{row.action}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </QueryView>
  );
}

type Can = (code: string) => boolean;

function stepRow(
  id: SetupStep['id'],
  query: { data: unknown; error: unknown },
  count: number | undefined,
  done: boolean,
): StepRow {
  return {
    id,
    done,
    count: count ?? null,
    failed: query.data === undefined && Boolean(query.error),
  };
}

/** The setup lists the user may read, and the checklist steps made from them. */
function useSetup(can: Can, now: Date) {
  const weekStart = hospitalToday(now);
  const departments = useQuery({
    queryKey: DEPARTMENTS_QUERY_KEY,
    queryFn: departmentsApi.list,
    enabled: can('admin.config.publish'),
  });
  const practitioners = useQuery({
    queryKey: PRACTITIONERS_QUERY_KEY,
    queryFn: practitionersApi.list,
    enabled: can('practitioner.manage'),
  });
  // The same key as the schedules screen's opening week, so both share the answer.
  const sessions = useQuery({
    queryKey: [...SCHEDULE_SESSIONS_QUERY_KEY, weekStart],
    queryFn: () => scheduleSessionsApi.list(weekStart, addDays(weekStart, 6)),
    enabled: can('scheduling.schedule.manage'),
  });
  const priceLists = useQuery({
    queryKey: PRICE_LISTS_QUERY_KEY,
    queryFn: priceListsApi.list,
    enabled: can('admin.price.publish'),
  });
  const users = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: adminApi.users,
    enabled: can('admin.user.manage'),
  });
  const activeUsers = users.data?.users.filter((user) => user.membershipStatus === 'ACTIVE');
  const published = sessions.data?.filter((session) => session.status === 'PUBLISHED');

  // A step is done when its list holds what the hospital needs to work (one account besides the
  // administrator's own for staff).
  const candidates: Array<[string, () => StepRow]> = [
    [
      'admin.config.publish',
      () =>
        stepRow(
          'departments',
          departments,
          departments.data?.length,
          (departments.data?.length ?? 0) > 0,
        ),
    ],
    [
      'practitioner.manage',
      () =>
        stepRow(
          'practitioners',
          practitioners,
          practitioners.data?.length,
          (practitioners.data?.length ?? 0) > 0,
        ),
    ],
    [
      'scheduling.schedule.manage',
      () => stepRow('sessions', sessions, published?.length, (published?.length ?? 0) > 0),
    ],
    [
      'admin.price.publish',
      () =>
        stepRow(
          'fees',
          priceLists,
          priceLists.data?.length,
          (priceLists.data ?? []).some((v) => v.inForce),
        ),
    ],
    [
      'admin.user.manage',
      () => stepRow('users', users, activeUsers?.length, (activeUsers?.length ?? 0) > 1),
    ],
  ];
  const steps = candidates.filter(([code]) => can(code)).map(([, build]) => build());
  return { steps, users, activeUsers, practitioners };
}

type Setup = ReturnType<typeof useSetup>;

function SetupTile({ steps }: { steps: StepRow[] }) {
  const t = useTranslations();
  const digits = useDigits();
  const progress = setupProgress(steps);
  const firstOpen = steps.find((row) => !row.done) ?? steps[0];
  if (!firstOpen) return null;
  return (
    <HomeTile
      label={t('home.kpiSetup')}
      value={t('home.kpiSetupValue', {
        done: digits(progress.done),
        total: digits(progress.total),
      })}
      note={t('home.kpiSetupNote', { left: progress.total - progress.done })}
      state={steps.every((row) => row.count !== null || row.failed) ? 'ready' : 'loading'}
      href={STEP_TEXT[firstOpen.id].href}
    />
  );
}

function UsersTile({ users, activeUsers }: Pick<Setup, 'users' | 'activeUsers'>) {
  const t = useTranslations();
  const digits = useDigits();
  const inactive = users.data && activeUsers ? users.data.users.length - activeUsers.length : null;
  return (
    <HomeTile
      label={t('home.kpiUsers')}
      value={activeUsers ? digits(activeUsers.length) : undefined}
      note={inactive === null ? undefined : t('home.kpiUsersNote', { count: digits(inactive) })}
      state={tileState(users)}
      href="/admin/users"
    />
  );
}

function RolesTile() {
  const t = useTranslations();
  const digits = useDigits();
  const roles = useRoles();
  return (
    <HomeTile
      label={t('home.kpiRoles')}
      value={roles.data ? digits(roles.data.roles.length) : undefined}
      state={tileState(roles)}
      href="/admin/roles"
    />
  );
}

function PractitionersTile({ practitioners }: Pick<Setup, 'practitioners'>) {
  const t = useTranslations();
  const digits = useDigits();
  const active = practitioners.data?.filter((row) => row.active).length;
  return (
    <HomeTile
      label={t('home.kpiPractitioners')}
      value={practitioners.data ? digits(practitioners.data.length) : undefined}
      note={
        active === undefined ? undefined : t('home.kpiPractitionersNote', { count: digits(active) })
      }
      state={tileState(practitioners)}
      href="/admin/practitioners"
    />
  );
}

/** Each tile is mounted only with its permission, so no tile reads what the user may not see. */
function AdminTiles({ can, setup }: { can: Can; setup: Setup }) {
  return (
    <TileRow>
      <SetupTile steps={setup.steps} />
      {can('admin.user.manage') ? (
        <UsersTile users={setup.users} activeUsers={setup.activeUsers} />
      ) : null}
      {can('admin.role.manage') ? <RolesTile /> : null}
      {can('practitioner.manage') ? (
        <PractitionersTile practitioners={setup.practitioners} />
      ) : null}
    </TileRow>
  );
}

export function AdminHome({ granted, now }: { granted: ReadonlySet<string>; now: Date }) {
  const t = useTranslations();
  const can: Can = (code) => granted.has(code);
  const setup = useSetup(can, now);
  const { done, total } = setupProgress(setup.steps);

  return (
    <div className="flex flex-col gap-4">
      <AdminTiles can={can} setup={setup} />
      <div className="grid gap-4 xl:grid-cols-12">
        {setup.steps.length > 0 ? (
          <WorkPanel
            title={t('home.panelSetup')}
            subtitle={t('home.kpiSetupNote', { left: total - done })}
            className="xl:col-span-7"
          >
            <SetupChecklist steps={setup.steps} />
          </WorkPanel>
        ) : null}
        {can('audit.view') ? (
          <WorkPanel
            title={t('home.panelAudit')}
            action={<ViewAllLink href="/admin/audit" />}
            className="xl:col-span-5"
          >
            <RecentActivity />
          </WorkPanel>
        ) : null}
      </div>
    </div>
  );
}
