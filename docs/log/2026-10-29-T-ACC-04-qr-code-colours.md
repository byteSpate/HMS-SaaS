# T-ACC-04 fix: MFA set-up QR code showed as a black square

- **Date:** 2026-10-29
- **Commit:** this commit
- **Implements:** fix for T-ACC-04; FR-ACC-006; AT-ACC-009

## What was fixed

On `/staff/mfa` the set-up QR code was a solid black square, so phones could not scan it (the text key underneath still worked). `QrCode` coloured its SVG with the Tailwind classes `fill-white` and `fill-black`, but `theme-light.css` sets `--color-*: initial`, which removes Tailwind's default palette. Neither class was generated, the background `<rect>` fell back to SVG's default fill (black), and the black modules disappeared into it. Found in manual testing with the dev seed.

The colours are now the SVG attributes `fill="white"` and `fill="black"`: fixed whatever the theme, as a camera needs, and colour keywords rather than hex, so the hex-colour lint rule still holds.

## Files

| File                                     | Purpose                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| apps/web/src/components/qr-code.tsx      | `fill` attributes instead of colour classes; comment says why       |
| apps/web/src/components/qr-code.test.tsx | Regression test: white background, black modules, no colour classes |

## Verification

| Command                                                                                           | Result                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `vitest run src/components/qr-code.test.tsx` on the old code                                      | 1 failed (the colour test), 1 passed                                           |
| the same on the fix                                                                               | 2 passed                                                                       |
| `eslint` on both files, `tsc --noEmit` in `@hms/web`                                              | clean                                                                          |
| search `apps/web` and `packages/ui` for Tailwind default colour classes (white, black, gray, ...) | none left; only built-in `*-transparent`, which does not depend on the palette |

## Known limitations

- The e2e test `e2e/mfa.spec.ts` checks the set-up flow but not how the QR code looks; the unit test now covers the colours.

## Deploy impact

None.

## How to debug

- **QR code black or missing again:** inspect the `<svg>` on `/staff/mfa`; the `<rect>` must have `fill="white"`. Colours come from theme tokens or attributes, never from a default Tailwind colour, because the theme removes that palette.
