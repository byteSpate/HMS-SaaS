// Shared table styling for the administration lists (SCR-22; T-ACC-05): small upper-case column
// heads, compact rows at text-xs (owner choice: smaller than body text), a minimum width so the table scrolls inside its card on a
// phone instead of squeezing columns. Plain class strings, so both tables stay identical.
export const TABLE_FRAME = 'overflow-x-auto rounded-panel border border-border bg-surface';
export const TABLE = 'w-full min-w-2xl text-start text-xs';
export const HEAD_CELL =
  'px-4 py-2.5 text-[0.6875rem] font-semibold tracking-wide text-text-muted uppercase';
export const ROW = 'border-t border-border hover:bg-surface-hover';
export const CELL = 'px-4 py-2';
/** The main line of a row (a person's or a role's name), a step above the rest of the row. */
export const ROW_TITLE = 'text-[0.8125rem] font-medium';
export const CODE_CHIP =
  'rounded-pill bg-primary-soft px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-primary uppercase';
