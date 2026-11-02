// Self-hosted fonts for print (T-PRN-01; FR-PRN-005). Embedded in the page, so the isolated PDF
// renderer needs no network (ADR-010) and Bangla conjuncts and vowel signs always shape the same way.
// Noto Sans Bengali covers Bangla and Latin with one family, so bilingual lines stay even. Static
// weights, because Chromium draws a variable font as shapes rather than embedding it as a font.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SUBSETS = [
  {
    file: 'bengali',
    range:
      'U+0951-0952,U+0964-0965,U+0980-09FE,U+1CD0,U+1CD2,U+1CD5-1CD6,U+1CD8,U+1CE1,U+1CEA,U+1CED,U+1CF2,U+1CF5-1CF7,U+200C-200D,U+20B9,U+25CC,U+A8F1',
  },
  {
    file: 'latin',
    range:
      'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
];

let cached: string | undefined;

const WEIGHTS = [400, 500, 700];

function faceFor(file: string, range: string, weight: number): string {
  const path = require.resolve(
    `@fontsource/noto-sans-bengali/files/noto-sans-bengali-${file}-${weight}-normal.woff2`,
  );
  const data = readFileSync(path).toString('base64');
  return `@font-face {
  font-family: 'Print Sans';
  font-weight: ${weight};
  src: url(data:font/woff2;base64,${data}) format('woff2');
  unicode-range: ${range};
}`;
}

export function fontFaceCss(): string {
  cached ??= SUBSETS.flatMap(({ file, range }) =>
    WEIGHTS.map((weight) => faceFor(file, range, weight)),
  ).join('\n');
  return cached;
}
