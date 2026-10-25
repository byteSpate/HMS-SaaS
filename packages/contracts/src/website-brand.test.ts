// Brand contrast cannot be broken by CMS editing. T-CMS-03, FR-CMS-013.
import { describe, expect, it } from 'vitest';
import { isAccessibleWebsiteColor } from './website-brand.js';
describe('website brand contrast', () => {
  it('allows readable primary colors and rejects light or malformed values', () => {
    expect(isAccessibleWebsiteColor('#00786f')).toBe(true);
    expect(isAccessibleWebsiteColor('#005f5a')).toBe(true);
    for (const value of ['#ffffff', '#aaffee', 'red', 'url(evil)', '#123', '#GGGGGG'])
      expect(isAccessibleWebsiteColor(value)).toBe(false);
  });
});
