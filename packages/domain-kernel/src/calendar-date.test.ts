import { describe, expect, it } from 'vitest';
import { calendarDateIn, yearOf } from './calendar-date.js';

describe('calendarDateIn', () => {
  it('uses the hospital date, which can differ from the UTC date', () => {
    const lateUtc = new Date('2026-12-31T19:00:00Z');
    expect(calendarDateIn(lateUtc, 'UTC')).toBe('2026-12-31');
    expect(calendarDateIn(lateUtc, 'Asia/Dhaka')).toBe('2027-01-01');
  });

  it('reads the year of a date', () => {
    expect(yearOf('1986-07-01')).toBe(1986);
  });
});
