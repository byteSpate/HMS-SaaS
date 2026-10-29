// Shared table styling for the administration lists (SCR-22; T-ACC-05): small upper-case column
// heads, compact rows at text-sm, a minimum width so the table scrolls inside its card on a
// phone instead of squeezing columns. Plain class strings, so both tables stay identical.
export const TABLE_FRAME = 'overflow-x-auto rounded-panel border border-border bg-surface';
export const TABLE = 'w-full min-w-2xl text-start text-sm';
export const HEAD_CELL = 'px-4 py-3 text-xs font-semibold tracking-wide text-text-muted uppercase';
export const ROW = 'border-t border-border hover:bg-surface-hover';
export const CELL = 'px-4 py-2.5';
export const CODE_CHIP =
  'rounded-pill bg-primary-soft px-2.5 py-0.5 text-xs font-semibold tracking-wide text-primary uppercase';
