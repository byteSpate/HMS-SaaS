// Dates and times shown to staff: dd-MM-yyyy and 24-hour HH:mm in the facility time zone
// (C-036, F section 7.4). The time pattern is an interim choice pending Q-050. Digits follow the
// UI language. Stored instants are never changed (FR-I18N-005).
import { toLocaleDigits } from './digits.js';
import type { Locale } from './locale.js';

export interface DateFormatOptions {
  /** IANA zone of the facility; Bangladesh has no daylight saving. */
  timeZone?: string;
}

const DEFAULT_TIME_ZONE = 'Asia/Dhaka';
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function partsOf(input: Date | string, timeZone: string): Record<string, string> {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: "${String(input)}"`);
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) parts[part.type] = part.value;
  return parts;
}

export function formatDate(
  input: Date | string,
  locale: Locale,
  { timeZone = DEFAULT_TIME_ZONE }: DateFormatOptions = {},
): string {
  const p = partsOf(input, timeZone);
  return toLocaleDigits(`${p.day}-${p.month}-${p.year}`, locale);
}

/**
 * The facility's calendar date at `input` as YYYY-MM-DD, with Western digits: the value of a date
 * input or an API query, not text to show (T-SCH-01, the week a schedule screen starts on).
 */
export function isoDateIn(
  input: Date | string,
  { timeZone = DEFAULT_TIME_ZONE }: DateFormatOptions = {},
): string {
  const p = partsOf(input, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatDateTime(
  input: Date | string,
  locale: Locale,
  { timeZone = DEFAULT_TIME_ZONE }: DateFormatOptions = {},
): string {
  const p = partsOf(input, timeZone);
  return toLocaleDigits(`${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`, locale);
}
