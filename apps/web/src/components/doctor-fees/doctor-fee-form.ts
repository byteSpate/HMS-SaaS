// The doctor-fee screens' rules (T-BIL-01; C-041; FR-CFG-002). Pure, so they are tested without
// rendering. They mirror the API's rules, which still decide every request. Amounts stay strings
// end to end (ADR-007): what the user typed becomes "500.00", never a float.
import type { DoctorFee, SetDoctorFeeRequest } from '@hms/contracts';
import { toWesternDigits } from '@hms/i18n';

export interface FeeForm {
  practitionerId: string;
  newPatientFee: string;
  followUpFee: string;
  followUpDays: string;
}

export function formOf(fee?: DoctorFee): FeeForm {
  return {
    practitionerId: fee?.practitioner.practitionerId ?? '',
    newPatientFee: fee?.newPatientFee ?? '',
    followUpFee: fee?.followUpFee ?? '',
    followUpDays: fee ? String(fee.followUpDays) : '',
  };
}

const AMOUNT = /^(\d{1,16})(?:\.(\d{1,2}))?$/;

/** A fee as the API takes it, or null when it is not a positive amount with two decimals. */
export function amountOf(text: string): string | null {
  const match = AMOUNT.exec(toWesternDigits(text.trim()));
  if (!match) return null;
  const amount = `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}`;
  // C-041 allows no reductions, so a fee of zero is not a fee.
  return /^0+\.00$/.test(amount) ? null : amount;
}

export function daysOf(text: string): number | null {
  const digits = toWesternDigits(text.trim());
  if (!/^\d{1,3}$/.test(digits)) return null;
  const days = Number(digits);
  return days >= 1 && days <= 365 ? days : null;
}

export function requestOf(form: FeeForm, expectedVersion: number): SetDoctorFeeRequest | null {
  const newPatientFee = amountOf(form.newPatientFee);
  const followUpFee = amountOf(form.followUpFee);
  const followUpDays = daysOf(form.followUpDays);
  if (!form.practitionerId || !newPatientFee || !followUpFee || !followUpDays) return null;
  return { newPatientFee, followUpFee, followUpDays, expectedVersion };
}

export interface PublishTiming {
  when: 'now' | 'date';
  /** A hospital date, YYYY-MM-DD, when `when` is "date". */
  date: string;
}

// C-024: every pilot hospital is in Bangladesh, as the API's hospital clock assumes.
const HOSPITAL_OFFSET = '+06:00';

/**
 * FR-CFG-002: undefined publishes now; a later date takes effect at its first moment. Null means
 * the choice cannot be sent: no date, or today or earlier, whose start has already passed.
 */
export function effectiveFromOf(timing: PublishTiming, today: string): string | undefined | null {
  if (timing.when === 'now') return undefined;
  if (!timing.date || timing.date <= today) return null;
  return `${timing.date}T00:00:00${HOSPITAL_OFFSET}`;
}
