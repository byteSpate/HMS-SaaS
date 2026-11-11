import { toLocaleDigits } from '@hms/i18n';
import { describe, expect, it } from 'vitest';
import { amountOf, daysOf, effectiveFromOf, requestOf } from './doctor-fee-form';

// The doctor-fee form's rules (T-BIL-01; C-041; FR-CFG-002). IDs are synthetic.
describe('doctor fee form', () => {
  it('reads an amount typed in either digit style, with two decimals', () => {
    expect(amountOf('500')).toBe('500.00');
    expect(amountOf(' 500.5 ')).toBe('500.50');
    expect(amountOf(toLocaleDigits('500', 'bn-BD'))).toBe('500.00');
    expect(amountOf('1,000')).toBeNull();
    expect(amountOf('0')).toBeNull();
    expect(amountOf('12.345')).toBeNull();
    expect(amountOf('')).toBeNull();
  });

  it('reads a follow-up window of 1 to 365 days', () => {
    expect(daysOf('14')).toBe(14);
    expect(daysOf(toLocaleDigits('14', 'bn-BD'))).toBe(14);
    expect(daysOf('0')).toBeNull();
    expect(daysOf('366')).toBeNull();
    expect(daysOf('7.5')).toBeNull();
  });

  it('builds the request only when every field is valid', () => {
    const form = {
      practitionerId: '0199e0b0-0000-7000-8000-000000000801',
      newPatientFee: '500',
      followUpFee: '300',
      followUpDays: '14',
    };
    expect(requestOf(form, 3)).toEqual({
      newPatientFee: '500.00',
      followUpFee: '300.00',
      followUpDays: 14,
      expectedVersion: 3,
    });
    expect(requestOf({ ...form, followUpFee: '' }, 3)).toBeNull();
    expect(requestOf({ ...form, practitionerId: '' }, 3)).toBeNull();
  });

  it('takes effect now, or from the start of a later hospital date', () => {
    expect(effectiveFromOf({ when: 'now', date: '' }, '2026-11-12')).toBeUndefined();
    expect(effectiveFromOf({ when: 'date', date: '2026-11-13' }, '2026-11-12')).toBe(
      '2026-11-13T00:00:00+06:00',
    );
    expect(effectiveFromOf({ when: 'date', date: '2026-11-12' }, '2026-11-12')).toBeNull();
    expect(effectiveFromOf({ when: 'date', date: '' }, '2026-11-12')).toBeNull();
  });
});
