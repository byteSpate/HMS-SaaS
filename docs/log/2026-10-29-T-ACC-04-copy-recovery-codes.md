# T-ACC-04: copy all recovery codes in one click

- **Date:** 2026-10-29
- **Commit:** this commit
- **Implements:** T-ACC-04; FR-ACC-006; ADR-004 (owner request 2026-10-29)

## What was built

The "Save your recovery codes" screen after MFA set-up has a **Copy all codes** button between the list and "I have saved the codes". It puts the ten codes on the clipboard, one per line; the button reads "Copied" for 3 seconds. If the browser refuses the clipboard, a message asks the person to select and copy the codes by hand. The result is announced in a live region (`role="status"`) for screen readers.

## Files

| File                                       | Purpose                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| apps/web/src/components/copy-button.tsx    | Reusable `CopyButton`: clipboard write, copied and failed states, live region |
| apps/web/src/components/mfa-setup.tsx      | The button on the recovery-codes view                                         |
| packages/i18n/src/messages/en.ts, bn-BD.ts | `mfa.copyCodes`, `mfa.codesCopied`, `mfa.copyFailed`                          |
| apps/web/e2e/mfa.spec.ts                   | Copy test (clipboard content checked); axe check on the recovery-codes view   |

## Decisions applied

- **Chosen in this task:**
  - The codes are copied as plain lines, nothing else, so they paste cleanly into a password manager or a note.
  - `CopyButton` lives in `apps/web` because only the staff app uses it; it moves to `@hms/ui` when a second app needs it.
  - The clipboard API works only in secure contexts (HTTPS, `localhost`); on plain HTTP the failure message appears and the codes stay selectable.

## Verification

| Command                                   | Result                                            |
| ----------------------------------------- | ------------------------------------------------- |
| `vitest run` in `@hms/i18n`               | 29 passed (catalog parity for the three new keys) |
| `tsc --noEmit` and `eslint` in `@hms/web` | clean                                             |
| `playwright test e2e/mfa.spec.ts`         | 4 passed (1 new: copy; axe on the recovery view)  |

## Known limitations

- The new Bangla texts are proposals until a native speaker reviews them (Q-050).
- Copied codes sit on the clipboard until something else is copied; the screen text already tells the person to store them safely.

## Deploy impact

None.

## How to debug

- **"Could not copy" appears:** the page is not in a secure context, or the browser blocked clipboard access; check the address is HTTPS (or `localhost`) and the browser's site permissions.
- **Type errors on the new `mfa.*` keys:** rebuild the catalogs, `pnpm --filter @hms/i18n build`.
