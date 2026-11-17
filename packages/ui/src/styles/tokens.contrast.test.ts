// @vitest-environment node
// Contrast and parity guard for the design tokens.
// Implements: T-UI-01, ADR-022 section 9 (rule 5), NFR-ACC-001, C-055.
// Reads the theme CSS as text, so a token changed to something unreadable, a token missing from
// one theme, or a dark theme that switches on by itself all fail here instead of in a hospital.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesDir = fileURLToPath(new URL('./', import.meta.url));
const read = (name: string): string => readFileSync(`${stylesDir}${name}`, 'utf8');

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Only plain hex values are parsed: tokens are the one place color literals may live (ADR-022).
function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const rawLine of css.split('\n')) {
    const line = rawLine.trim();
    const separator = line.indexOf(': ');
    const end = line.indexOf(';');
    if (!line.startsWith('--') || separator < 0 || end < separator) continue;
    const value = line.slice(separator + 2, end).trim();
    if (HEX_COLOR.test(value)) tokens.set(line.slice(2, separator), value.toLowerCase());
  }
  return tokens;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = channel(Number.parseInt(hex.slice(1, 3), 16));
  const g = channel(Number.parseInt(hex.slice(3, 5), 16));
  const b = channel(Number.parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const STATUSES = ['idle', 'active', 'review', 'attention', 'done', 'problem'] as const;

// Text needs 4.5:1 (WCAG 1.4.3). Pairs are [foreground token, background token].
const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['color-text', 'color-bg'],
  ['color-text', 'color-surface'],
  ['color-text-muted', 'color-bg'],
  ['color-text-muted', 'color-surface'],
  ['color-text', 'color-surface-hover'],
  ['color-text-muted', 'color-surface-hover'],
  ['color-heading', 'color-bg'],
  ['color-heading', 'color-surface'],
  ['color-primary', 'color-bg'],
  ['color-primary', 'color-surface'],
  ['color-primary', 'color-primary-soft'],
  ['color-text', 'color-primary-soft'],
  ['color-on-primary', 'color-primary'],
  ['color-on-primary', 'color-primary-strong'],
  ['color-on-danger', 'color-danger'],
  ['color-accent', 'color-surface'],
  ['color-accent', 'color-accent-soft'],
  ...STATUSES.map((s) => [`color-status-${s}-text`, `color-status-${s}-bg`] as const),
  ['color-sidebar-text', 'color-sidebar-bg'],
  ['color-sidebar-text', 'color-sidebar-hover'],
  ['color-sidebar-text', 'color-sidebar-active'],
  ['color-sidebar-muted', 'color-sidebar-bg'],
];

// Boundaries and focus indicators need 3:1 (WCAG 1.4.11, 2.4.11).
const NON_TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['color-focus', 'color-bg'],
  ['color-focus', 'color-surface'],
  ['color-border-strong', 'color-bg'],
  ['color-border-strong', 'color-surface'],
  ['color-sidebar-focus', 'color-sidebar-bg'],
  ['color-sidebar-focus', 'color-sidebar-active'],
];

describe.each([
  { theme: 'light', file: 'theme-light.css' },
  { theme: 'dark', file: 'theme-dark.css' },
])('$theme theme tokens', ({ file }) => {
  const tokens = parseTokens(read(file));

  const ratioOf = (pair: readonly [string, string]): number => {
    const [foreground, background] = pair;
    const fg = tokens.get(foreground);
    const bg = tokens.get(background);
    if (!fg || !bg) {
      throw new Error(`Token missing in ${file}: ${!fg ? foreground : background}`);
    }
    return contrast(fg, bg);
  };

  it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (foreground, background) => {
    expect(ratioOf([foreground, background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('%s against %s reaches 3:1', (foreground, background) => {
    expect(ratioOf([foreground, background])).toBeGreaterThanOrEqual(3);
  });
});

describe('theme files', () => {
  it('define the same token names in light and dark', () => {
    const light = [...parseTokens(read('theme-light.css')).keys()].sort();
    const dark = [...parseTokens(read('theme-dark.css')).keys()].sort();
    expect(dark).toEqual(light);
  });

  it('apply dark only through data-theme, never from the system preference', () => {
    for (const file of ['theme-light.css', 'theme-dark.css', 'index.css']) {
      expect(read(file)).not.toContain('prefers-color-scheme');
    }
    expect(read('theme-dark.css')).toContain("[data-theme='dark']");
  });

  it('declare a light color scheme by default', () => {
    expect(read('index.css')).toContain('color-scheme: light');
  });
});
