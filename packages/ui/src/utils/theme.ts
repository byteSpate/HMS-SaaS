// Light and dark theme switching for the staff app (Role Home v2 design, C-055 switched on by the
// product owner on 2026-11-17). Dark applies only through data-theme="dark" on <html>, never from
// the system preference, so the tokens test keeps its guarantee. The choice is a per-viewer
// convenience in local storage: the page works the same when storage is blocked.
// Implements: T-UI-02, ADR-022 section 4.
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'hms.theme';

export function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

export function storeTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage blocked: the theme lasts for this page view only
  }
}

/**
 * Inline script for the document head: applies a stored dark theme before the first paint, so a
 * dark-theme user never sees a light flash. Kept tiny and free of imports on purpose.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`;
