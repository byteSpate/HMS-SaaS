// Price list rules (T-BIL-01; FR-CFG-002; C-041). Pure: which versions may change, when a
// publication takes effect, and what it changes against the version in force. The doctor fee of
// a practitioner is its new-patient fee, its follow-up fee and its follow-up window in days.
import { DomainError, fieldError, type Money } from '@hms/domain-kernel';

/** The two system items a doctor fee is priced with (C-041); names are in the i18n catalogs. */
export const DOCTOR_FEE_NEW = 'DOCTOR_FEE_NEW';
export const DOCTOR_FEE_FOLLOW_UP = 'DOCTOR_FEE_FOLLOW_UP';

export interface FeeValues {
  newPatientFee: Money;
  followUpFee: Money;
  followUpDays: number;
}

/** A published version is a record of what was charged; only the draft changes. */
export function assertDraft(status: string): void {
  if (status !== 'DRAFT') {
    throw new DomainError('INVALID_TRANSITION', 'Only the draft price list can change', {
      status,
    });
  }
}

// A form that says "now" reaches the server a moment later; within this margin a requested time
// counts as now instead of being refused as past.
const NOW_MARGIN_MS = 5 * 60_000;

/** FR-CFG-002: immediate, or a future time. A past time would reprice what already happened. */
export function effectiveTimeFor(requested: Date | undefined, now: Date): Date {
  if (!requested) return now;
  if (requested.getTime() >= now.getTime()) return requested;
  if (now.getTime() - requested.getTime() <= NOW_MARGIN_MS) return now;
  throw fieldError('effectiveFrom', 'Choose now or a time that has not passed');
}

export interface DoctorFeeChange {
  practitionerId: string;
  change: 'ADDED' | 'CHANGED' | 'REMOVED';
  before: FeeValues | null;
  after: FeeValues | null;
}

const sameFee = (left: FeeValues, right: FeeValues) =>
  left.newPatientFee.equals(right.newPatientFee) &&
  left.followUpFee.equals(right.followUpFee) &&
  left.followUpDays === right.followUpDays;

/** FR-CFG-002: the human-readable summary of a publication, one row per doctor that changes. */
export function diffDoctorFees(
  before: ReadonlyMap<string, FeeValues>,
  after: ReadonlyMap<string, FeeValues>,
): DoctorFeeChange[] {
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort();
  return ids.flatMap((practitionerId): DoctorFeeChange[] => {
    const old = before.get(practitionerId) ?? null;
    const next = after.get(practitionerId) ?? null;
    if (old && next) {
      return sameFee(old, next)
        ? []
        : [{ practitionerId, change: 'CHANGED', before: old, after: next }];
    }
    if (next) return [{ practitionerId, change: 'ADDED', before: null, after: next }];
    return [{ practitionerId, change: 'REMOVED', before: old, after: null }];
  });
}

const DAY_MS = 86_400_000;
const dayNumber = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / DAY_MS;

/**
 * C-041: a return to the same doctor within that doctor's follow-up window, counted in hospital
 * calendar days from the patient's last consultation with the doctor, is charged the follow-up
 * fee. A first consultation is always a new-patient fee.
 */
export function isFollowUp(
  lastConsultationDate: string | null,
  visitDate: string,
  followUpDays: number,
): boolean {
  if (!lastConsultationDate) return false;
  return dayNumber(visitDate) - dayNumber(lastConsultationDate) <= followUpDays;
}
