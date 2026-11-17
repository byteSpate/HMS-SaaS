// The rules of the role home (Role Home v2 design; F section 2.1, the role's home): which views a
// user gets from their permissions, and the counts the tiles show, computed from lists the API
// already returns. Pure functions, so the numbers are tested without a browser.
// Implements: T-UI-03 (role home), FR-ACC-009 (show only what the server would allow).
import type { CashierQueue, DoctorWorklist, ScheduleSession, WorklistStatus } from '@hms/contracts';

export type HomeView = 'reception' | 'doctor' | 'finance' | 'admin';

/** A view appears when the user holds at least one of its permissions (in this order). */
export const HOME_VIEW_PERMISSIONS: Readonly<Record<HomeView, readonly string[]>> = {
  reception: ['patient.record.search', 'scheduling.schedule.manage', 'scheduling.appointment.book'],
  doctor: ['clinical.consultation.record'],
  finance: ['billing.cashier_session.review', 'billing.payment.record'],
  admin: [
    'admin.config.publish',
    'practitioner.manage',
    'admin.price.publish',
    'admin.user.manage',
    'admin.role.manage',
    'audit.view',
  ],
};

export function homeViews(granted: ReadonlySet<string>): HomeView[] {
  return (Object.keys(HOME_VIEW_PERMISSIONS) as HomeView[]).filter((view) =>
    HOME_VIEW_PERMISSIONS[view].some((code) => granted.has(code)),
  );
}

export type SessionPhase = 'running' | 'upcoming' | 'finished' | 'draft' | 'cancelled';

/** Where a doctor session stands at `now`: only a published session can be running. */
export function sessionPhase(
  session: Pick<ScheduleSession, 'status' | 'startsAt' | 'endsAt'>,
  now: Date,
): SessionPhase {
  if (session.status === 'CANCELLED') return 'cancelled';
  if (session.status === 'DRAFT') return 'draft';
  const time = now.getTime();
  if (time < new Date(session.startsAt).getTime()) return 'upcoming';
  if (time >= new Date(session.endsAt).getTime()) return 'finished';
  return 'running';
}

export interface ReceptionCounts {
  sessions: number;
  running: number;
  booked: number;
}

/** Today's sessions that take patients (draft and cancelled ones are not counted). */
export function receptionCounts(sessions: readonly ScheduleSession[], now: Date): ReceptionCounts {
  const open = sessions.filter((session) => session.status === 'PUBLISHED');
  return {
    sessions: open.length,
    running: open.filter((session) => sessionPhase(session, now) === 'running').length,
    booked: open.reduce((sum, session) => sum + session.bookedCount, 0),
  };
}

export function worklistCounts(worklist: DoctorWorklist): Record<WorklistStatus, number> {
  const counts: Record<WorklistStatus, number> = {
    EXPECTED: 0,
    WAITING_PAYMENT: 0,
    WAITING: 0,
    IN_CONSULTATION: 0,
    CONSULTED: 0,
  };
  for (const entry of worklist.sessions.flatMap((session) => session.entries)) {
    counts[entry.status] += 1;
  }
  return counts;
}

/** The longest wait among patients still waiting to be seen, in whole minutes. */
export function longestWaitMinutes(worklist: DoctorWorklist, now: Date): number | null {
  const waits = worklist.sessions
    .flatMap((session) => session.entries)
    .filter((entry) => entry.status === 'WAITING' && entry.arrivedAt !== null)
    .map((entry) =>
      Math.floor((now.getTime() - new Date(entry.arrivedAt ?? '').getTime()) / 60_000),
    );
  return waits.length === 0 ? null : Math.max(0, ...waits);
}

/** Every open balance in the cashier queue, as amount strings (summed with the money type). */
export function queueBalances(queue: CashierQueue['patients']): string[] {
  return queue.flatMap((row) => row.invoices.map((invoice) => invoice.balance));
}

export interface SetupStep {
  id: 'departments' | 'practitioners' | 'sessions' | 'fees' | 'users';
  done: boolean;
}

export function setupProgress(steps: readonly SetupStep[]): { done: number; total: number } {
  return { done: steps.filter((step) => step.done).length, total: steps.length };
}
