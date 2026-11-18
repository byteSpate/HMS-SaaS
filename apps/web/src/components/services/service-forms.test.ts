// Service form rules (T-ORD-01; FR-ORD-001, FR-ORD-007, FR-I18N-006).
import type { ServiceRecord } from '@hms/contracts';
import { describe, expect, it } from 'vitest';
import {
  isServiceComplete,
  reportHoursOf,
  serviceDiffers,
  serviceFieldsOf,
  serviceFormOf,
  serviceName,
} from './service-form';

const cbc: ServiceRecord = {
  serviceItemId: '0199e0b0-0000-7000-8000-000000000a01',
  code: 'CBC',
  category: 'LAB',
  nameBn: null,
  nameEn: 'Complete blood count',
  directlyOrderable: true,
  reportHours: 6,
  active: true,
  version: 1,
};

describe('service form', () => {
  it('needs a code, a name and a valid report time for a new service', () => {
    const form = { ...serviceFormOf(), code: 'cbc', nameEn: 'CBC' };
    expect(isServiceComplete(form, true)).toBe(true);
    expect(isServiceComplete({ ...form, code: '1X' }, true)).toBe(false);
    expect(isServiceComplete({ ...form, nameEn: ' ' }, true)).toBe(false);
    expect(isServiceComplete({ ...form, reportHours: '0' }, true)).toBe(false);
    expect(reportHoursOf({ ...form, reportHours: '' })).toBeNull();
    expect(serviceFieldsOf({ ...form, reportHours: '24' })).toMatchObject({ reportHours: 24 });
  });

  it('knows when an edit changes nothing', () => {
    expect(serviceDiffers(cbc, serviceFormOf(cbc))).toBe(false);
    expect(serviceDiffers(cbc, { ...serviceFormOf(cbc), reportHours: '4' })).toBe(true);
  });

  it('names a service in the screen language, else the other, else its code', () => {
    expect(serviceName(cbc, 'bn-BD')).toBe('Complete blood count');
    expect(serviceName({ ...cbc, nameEn: null }, 'en')).toBe('CBC');
  });
});
