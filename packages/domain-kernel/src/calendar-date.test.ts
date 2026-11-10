import { describe, expect, it } from 'vitest';
import { calendarDateIn, instantAt, wallClockTimeIn, yearOf } from './calendar-date.js';

describe('calendarDateIn', () => {
  it('uses the hospital date, which can differ from the UTC date', () => {
    const lateUtc = new Date('2026-12-31T19:00:00Z');
    expect(calendarDateIn(lateUtc, 'UTC')).toBe('2026-12-31');
    expect(calendarDateIn(lateUtc, 'Asia/Dhaka')).toBe('2027-01-01');
  });

  it('turns a hospital date and wall-clock time into the instant (T-SCH-01)', () => {
    expect(instantAt('2026-11-12', '09:30', 'Asia/Dhaka').toISOString()).toBe(
      '2026-11-12T03:30:00.000Z',
    );
    expect(instantAt('2027-01-01', '02:00', 'Asia/Dhaka').toISOString()).toBe(
      '2026-12-31T20:00:00.000Z',
    );
    expect(instantAt('2026-11-12', '09:30', 'UTC').toISOString()).toBe('2026-11-12T09:30:00.000Z');
  });

  it('shows an instant as HH:mm on the hospital clock', () => {
    expect(wallClockTimeIn(new Date('2026-11-13T11:00:00Z'), 'Asia/Dhaka')).toBe('17:00');
    expect(wallClockTimeIn(new Date('2026-12-31T18:05:00Z'), 'Asia/Dhaka')).toBe('00:05');
  });

  it('reads the year of a date', () => {
    expect(yearOf('1986-07-01')).toBe(1986);
  });
});
