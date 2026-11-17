// Shared table styling for the list screens (SCR-22; T-ACC-05): small upper-case column heads,
// compact rows at text-xs (owner choice: smaller than body text). Below the desktop tier each row
// stacks into a short card (`stack-table`, Role Home v2 design): give every cell after the first
// a `data-label` with its column name and the actions cell `data-cell="actions"`.
// Plain class strings, so every table stays identical.
export const TABLE_FRAME = 'overflow-x-auto rounded-panel border border-border bg-surface';
export const TABLE = 'stack-table w-full text-start text-xs xl:min-w-2xl';
export const HEAD_CELL =
  'px-4 py-2.5 text-[0.6875rem] font-semibold tracking-wide text-text-muted uppercase';
export const ROW = 'border-t border-border hover:bg-surface-hover';
export const CELL = 'px-4 py-2';
/** The main line of a row (a person's or a role's name), a step above the rest of the row. */
export const ROW_TITLE = 'text-[0.8125rem] font-medium';
/** The filter row above a list (Role Home v2 design, "Page toolbar"). */
export const TOOLBAR = 'mb-4 rounded-panel border border-border bg-surface p-4';
export const CODE_CHIP =
  'rounded-pill bg-primary-soft px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-primary uppercase';
