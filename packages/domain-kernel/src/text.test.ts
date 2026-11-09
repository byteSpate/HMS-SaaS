import { describe, expect, it } from 'vitest';
import { tidyText } from './text.js';

describe('tidyText', () => {
  it('tidies spaces and treats blank as not recorded', () => {
    expect(tidyText('  Dr.   Karim  Uddin ')).toBe('Dr. Karim Uddin');
    expect(tidyText('   ')).toBeNull();
    expect(tidyText(undefined)).toBeNull();
    expect(tidyText(null)).toBeNull();
  });

  it('stores Bangla in NFC, so the same text typed two ways compares equal', () => {
    // KA + E sign + AA sign, as some keyboards type it, is KA + O sign in NFC.
    const typedInParts = String.fromCharCode(0x0995, 0x09c7, 0x09be);
    const composed = String.fromCharCode(0x0995, 0x09cb);
    expect(tidyText(typedInParts)).toBe(composed);
  });
});
