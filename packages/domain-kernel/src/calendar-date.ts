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

/** The HH:mm wall-clock time of `instant` in `timeZone`, 24-hour clock. */
export function wallClockTimeIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

/** Minutes `timeZone` is ahead of UTC at `instant`. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  );
  return (wallClock - instant.getTime()) / 60_000;
}

/**
 * The instant at YYYY-MM-DD `isoDate` and HH:mm `time` on the wall clock of `timeZone` (T-SCH-01:
 * a session "09:30 to 13:00" is entered in hospital time). The offset is read at that moment, so
 * a zone with daylight saving gets the offset of the date, not of today.
 */
export function instantAt(isoDate: string, time: string, timeZone: string): Date {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(asUtc - offsetMinutes(new Date(asUtc), timeZone) * 60_000);
}

/** The year of a YYYY-MM-DD date. */
export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}
