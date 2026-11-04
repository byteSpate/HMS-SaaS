// A patient's age for the banner and search results (T-PAT-02; FR-PAT-006, FR-PAT-010). An age from
// a reported age stays marked as estimated, so the screen never shows it as exact.
import { yearOf } from '@hms/domain-kernel';

export interface BirthRecord {
  birthDate: string | null;
  birthDatePrecision: string;
  birthYear: number | null;
}

export interface Age {
  years: number;
  estimated: boolean;
}

export function ageOn(record: BirthRecord, today: string): Age | null {
  if (record.birthDatePrecision === 'EXACT' && record.birthDate !== null) {
    // Whole years: one less until this year's birthday (MM-DD) has come.
    const hadBirthday = today.slice(5) >= record.birthDate.slice(5);
    return {
      years: yearOf(today) - yearOf(record.birthDate) - (hadBirthday ? 0 : 1),
      estimated: false,
    };
  }
  if (record.birthYear !== null)
    return { years: yearOf(today) - record.birthYear, estimated: true };
  return null;
}
