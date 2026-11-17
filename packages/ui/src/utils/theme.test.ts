// Theme switching: dark only through data-theme, remembered per device, safe without storage.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStoredTheme, storeTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './theme.js';

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

describe('theme', () => {
  it('defaults to light', () => {
    expect(readStoredTheme()).toBe('light');
  });

  it('applies and remembers dark, and removes the attribute for light', () => {
    storeTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredTheme()).toBe('dark');

    storeTheme('light');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(readStoredTheme()).toBe('light');
  });

  it('still switches when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    storeTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('gives the head script the same storage key and attribute as the toggle', () => {
    // The script runs before any module, so it repeats the key as text; keep the two in step.
    expect(THEME_INIT_SCRIPT).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')==='dark'`);
    expect(THEME_INIT_SCRIPT).toContain("dataset.theme='dark'");
    expect(THEME_INIT_SCRIPT.startsWith('try{')).toBe(true);
  });
});
