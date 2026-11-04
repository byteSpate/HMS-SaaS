// Calendar dates in a hospital's time zone (T-PAT-01, FR-PAT-006). "Today" for a reported age is the
// hospital's date, not the server's: a registration at 01:00 in Dhaka is still the previous UTC day.

/** The YYYY-MM-DD date of `instant` in `timeZone`, for example 'Asia/Dhaka'. */
export function calendarDateIn(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** The year of a YYYY-MM-DD date. */
export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}
