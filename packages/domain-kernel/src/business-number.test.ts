import { describe, expect, it } from 'vitest';
import { formatBusinessNumber } from './index.js';

describe('formatBusinessNumber (C-033, CP-09)', () => {
  it('fills the prefix and pads the sequence', () => {
    expect(formatBusinessNumber('{PREFIX}-{seq:6}', 123, 'SMH')).toBe('SMH-000123');
  });

  it('never cuts a number that outgrows its width', () => {
    expect(formatBusinessNumber('{PREFIX}-{seq:6}', 1_234_567, 'SMH')).toBe('SMH-1234567');
  });

  it('allows a pattern without a prefix or a width', () => {
    expect(formatBusinessNumber('RCPT{seq}', 7)).toBe('RCPT7');
  });

  it.each(['{PREFIX}-000', '{seq:6}-{seq:6}', '{PREFIX}-{seq:x}', '{OTHER}-{seq:6}'])(
    'refuses the pattern %s',
    (pattern) => {
      expect(() => formatBusinessNumber(pattern, 1, 'SMH')).toThrow('Invalid number pattern');
    },
  );

  it('refuses a pattern that needs a prefix when none is set', () => {
    expect(() => formatBusinessNumber('{PREFIX}-{seq:6}', 1)).toThrow('needs a prefix');
  });
});
