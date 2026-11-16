import { describe, expect, it } from 'vitest';
import { entityTagOf, matchesIfNoneMatch } from './conditional-get.js';

// Conditional GET helpers (T-CLI-01; ADR-015; RFC 9110 sections 8.8.3 and 13.1.2).
describe('conditional GET', () => {
  it('gives equal data an equal strong tag and changed data another', () => {
    const tag = entityTagOf({ sessions: [{ status: 'WAITING' }] });
    expect(tag).toMatch(/^"[\w-]{32}"$/);
    expect(entityTagOf({ sessions: [{ status: 'WAITING' }] })).toBe(tag);
    expect(entityTagOf({ sessions: [{ status: 'IN_CONSULTATION' }] })).not.toBe(tag);
  });

  it('matches If-None-Match lists, weak forms and "*", and nothing without the header', () => {
    const tag = '"abc"';
    expect(matchesIfNoneMatch(undefined, tag)).toBe(false);
    expect(matchesIfNoneMatch('"other"', tag)).toBe(false);
    expect(matchesIfNoneMatch('"other", "abc"', tag)).toBe(true);
    expect(matchesIfNoneMatch('W/"abc"', tag)).toBe(true);
    expect(matchesIfNoneMatch(['"x"', '"abc"'], tag)).toBe(true);
    expect(matchesIfNoneMatch('*', tag)).toBe(true);
  });
});
