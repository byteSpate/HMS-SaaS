// CMS labels have key parity and no missing translations. T-CMS-03, C-062.
import { describe, expect, it } from 'vitest';
import { cmsBnBD, cmsEn } from './index.js';
function flatten(tree: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value as Record<string, unknown>, `${prefix}${key}.`)),
    ),
  );
}
describe('CMS catalogs', () => {
  it('has matching keys and placeholders in both languages', () => {
    const en = flatten(cmsEn);
    const bn = flatten(cmsBnBD);
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(en)) {
      expect(bn[key]?.trim(), key).toBeTruthy();
      expect(bn[key]?.match(/\{\w+\}/g) ?? [], key).toEqual(value.match(/\{\w+\}/g) ?? []);
    }
  });
});
