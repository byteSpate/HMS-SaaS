import { describe, expect, it } from 'vitest';
import { normalizedNid, visiblePartOf } from './nid.js';
import { searchTermOf } from './search-term.js';

// National ID numbers (T-PAT-03; FR-PAT-007).
describe('normalizedNid', () => {
  it.each([
    ['1234567890', '1234567890'],
    ['123 456 7890', '1234567890'],
    ['1990-123-456-7890-123', '19901234567890123'],
    ['\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef\u09e6', '1234567890'],
  ])('%s becomes %s', (raw, nid) => {
    expect(normalizedNid(raw)).toBe(nid);
  });

  it('accepts only the issued lengths, 10, 13 or 17 digits', () => {
    expect(normalizedNid('123456789')).toBeNull();
    expect(normalizedNid('12345678901')).toBeNull();
    expect(normalizedNid('12345A7890')).toBeNull();
    expect(normalizedNid('1234567890123')).toBe('1234567890123');
  });

  it('shows only the last four digits', () => {
    expect(visiblePartOf('19901234567890123')).toBe('0123');
  });
});

describe('searchTermOf with an NID', () => {
  it('reads NID lengths as an NID, a mobile number still as a phone', () => {
    expect(searchTermOf('123 456 7890')).toEqual({ kind: 'NID', nid: '1234567890' });
    expect(searchTermOf('01700000001')).toEqual({ kind: 'PHONE', phone: '01700000001' });
    expect(searchTermOf('123')).toEqual({ kind: 'MRN_NUMBER', mrnSuffix: '-000123' });
  });
});
