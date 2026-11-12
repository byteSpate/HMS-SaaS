// The navigation model of the staff app (F section 2.1). Each entry names the permission code
// it needs; entries are filtered before they reach the shell, so a user never sees a link to
// something the server would refuse (FR-ACC-009). The session carries the permission codes of the
// chosen hospital's roles (T-ACC-05); the API still checks every request.
// Implements: T-UI-02, T-ACC-05, T-PAT-02, T-PRA-01, T-SCH-01, T-BIL-01, T-BIL-03.
import type { IconName } from '@hms/ui';

// Full catalog keys, so the unused-key check can see them as literals.
export type NavLabelKey =
  | 'nav.home'
  | 'nav.patients'
  | 'nav.schedules'
  | 'nav.cashier'
  | 'nav.cashierSessions'
  | 'nav.practitioners'
  | 'nav.departments'
  | 'nav.doctorFees'
  | 'nav.users'
  | 'nav.roles'
  | 'nav.audit';

export interface NavDefinition {
  id: string;
  labelKey: NavLabelKey;
  href: string;
  icon: IconName;
  /** Permission code from the contracts catalog; omitted when every signed-in user may see it. */
  requires?: string;
}

export const NAVIGATION: readonly NavDefinition[] = [
  { id: 'home', labelKey: 'nav.home', href: '/', icon: 'home' },
  // T-PAT-01, T-PAT-02 (SCR-02): the front desk.
  {
    id: 'patients',
    labelKey: 'nav.patients',
    href: '/patients',
    icon: 'search',
    requires: 'patient.record.search',
  },
  // T-SCH-01 (SCR-04): doctor sessions, for reception and the administrator.
  {
    id: 'schedules',
    labelKey: 'nav.schedules',
    href: '/schedules',
    icon: 'calendar',
    requires: 'scheduling.schedule.manage',
  },
  // T-BIL-03 (SCR-06, SCR-07): the cashier desk with the cashier's own session.
  {
    id: 'cashier',
    labelKey: 'nav.cashier',
    href: '/cashier',
    icon: 'briefcase',
    requires: 'billing.cashier_session.manage',
  },
  // T-BIL-03 (SCR-21): finance reviews closed cashier sessions.
  {
    id: 'cashier-sessions',
    labelKey: 'nav.cashierSessions',
    href: '/cashier-sessions',
    icon: 'shield-check',
    requires: 'billing.cashier_session.review',
  },
  // T-PRA-01: the practitioner master, for the hospital administrator.
  {
    id: 'practitioners',
    labelKey: 'nav.practitioners',
    href: '/admin/practitioners',
    icon: 'stethoscope',
    requires: 'practitioner.manage',
  },
  // T-PRA-02: the department master, hospital configuration.
  {
    id: 'departments',
    labelKey: 'nav.departments',
    href: '/admin/departments',
    icon: 'hospital-building',
    requires: 'admin.config.publish',
  },
  // T-BIL-01: doctor fees in the price list, for the administrator and finance.
  {
    id: 'doctor-fees',
    labelKey: 'nav.doctorFees',
    href: '/admin/doctor-fees',
    icon: 'certificate',
    requires: 'admin.price.publish',
  },
  // T-ACC-05 (SCR-22): hospital administration.
  {
    id: 'users',
    labelKey: 'nav.users',
    href: '/admin/users',
    icon: 'users',
    requires: 'admin.user.manage',
  },
  {
    id: 'roles',
    labelKey: 'nav.roles',
    href: '/admin/roles',
    icon: 'shield-check',
    requires: 'admin.role.manage',
  },
  // T-PLT-02 (SCR-24).
  {
    id: 'audit',
    labelKey: 'nav.audit',
    href: '/admin/audit',
    icon: 'file-text',
    requires: 'audit.view',
  },
];

export function visibleNavigation(
  definitions: readonly NavDefinition[],
  granted: ReadonlySet<string>,
): NavDefinition[] {
  return definitions.filter((item) => item.requires === undefined || granted.has(item.requires));
}

/** The item whose route contains the current path; the home route only matches exactly. */
export function activeNavigationId(
  definitions: readonly NavDefinition[],
  pathname: string,
): string | undefined {
  const match = definitions
    .filter((item) => (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.id;
}
