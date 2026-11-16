// The doctor worklist screen's rules (T-CLI-01; FR-CLI-002; SCR-08; F sections 4.3, 6 and 7.3).
// Pure, so they are tested without rendering: which patients can be opened, the next one Enter
// opens, how long a patient has waited, how a status looks, and how many became WAITING since the
// last poll (announced in a live region).
import type { DoctorWorklist, WorklistEntry, WorklistStatus } from '@hms/contracts';
import type { StatusKind } from '@hms/ui';

/** F 4.3: WAITING_PAYMENT is shown greyed with its reason and cannot be opened (C-011). */
export function canStart(entry: WorklistEntry): boolean {
  return entry.status === 'WAITING' && entry.visitId !== null && entry.visitVersion !== null;
}

const entriesOf = (worklist: DoctorWorklist) =>
  worklist.sessions.flatMap((session) => session.entries);

/** Enter opens the next WAITING patient, in queue order (F 4.3 step 1). */
export function nextWaiting(worklist: DoctorWorklist): WorklistEntry | null {
  return entriesOf(worklist).find(canStart) ?? null;
}

/** Whole minutes since the patient arrived; null before arrival. */
export function waitingMinutes(entry: WorklistEntry, now: Date): number | null {
  if (!entry.arrivedAt) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(entry.arrivedAt).getTime()) / 60_000));
}

/** F 7.3: "n new patients waiting", counted against the list the doctor saw before. */
export function newlyWaiting(before: DoctorWorklist | undefined, after: DoctorWorklist): number {
  if (!before) return 0;
  const waitingBefore = new Set(
    entriesOf(before)
      .filter((entry) => entry.status === 'WAITING')
      .map((entry) => entry.appointmentId),
  );
  return entriesOf(after).filter(
    (entry) => entry.status === 'WAITING' && !waitingBefore.has(entry.appointmentId),
  ).length;
}

// F 6: neutral, amber, blue, purple, green. Full catalog keys as literals, so the unused-key check
// can see them.
export const WORKLIST_STATUS: Record<
  WorklistStatus,
  { labelKey: `worklist.status${WorklistStatus}`; badge: StatusKind }
> = {
  EXPECTED: { labelKey: 'worklist.statusEXPECTED', badge: 'idle' },
  WAITING_PAYMENT: { labelKey: 'worklist.statusWAITING_PAYMENT', badge: 'attention' },
  WAITING: { labelKey: 'worklist.statusWAITING', badge: 'active' },
  IN_CONSULTATION: { labelKey: 'worklist.statusIN_CONSULTATION', badge: 'review' },
  CONSULTED: { labelKey: 'worklist.statusCONSULTED', badge: 'done' },
};
