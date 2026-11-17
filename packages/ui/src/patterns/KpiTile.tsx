// One number on a role home, with its label and a comparison line; the whole tile is a link to
// the list behind the number (Role Home v2 design, "KPI tile"). States from the States and
// Inventory sheet: ready, loading (three bars), and error (a problem chip in place of the
// number). Implements: T-UI-03, NFR-ACC-001.
import type { ComponentType } from 'react';
import type { ShellLinkProps } from '../layouts/AppShell.js';
import { Icon } from '../icons/Icon.js';
import { Skeleton } from '../primitives/Skeleton.js';
import { cx } from '../utils/cx.js';

export type KpiTileState = 'ready' | 'loading' | 'error';

export interface KpiTileProps {
  /** Texts already translated; `value` already formatted in the reader's digits. */
  label: string;
  value?: string;
  note?: string;
  state?: KpiTileState;
  /** Shown in place of the number when the tile could not load. */
  errorLabel?: string;
  href: string;
  linkComponent?: ComponentType<ShellLinkProps>;
}

const PlainLink: ComponentType<ShellLinkProps> = (props) => <a {...props} />;

export function KpiTile({
  label,
  value,
  note,
  state = 'ready',
  errorLabel,
  href,
  linkComponent,
}: KpiTileProps) {
  const Link = linkComponent ?? PlainLink;
  return (
    <Link
      href={href}
      className={cx(
        'flex min-h-23 flex-col gap-0.5 rounded-panel border border-border bg-surface px-4 py-3 no-underline',
        'transition-colors hover:bg-surface-hover',
      )}
    >
      <span className="text-sm font-medium text-text-muted">{label}</span>
      {state === 'loading' ? (
        <span role="status" aria-busy="true" className="flex flex-col gap-2 pt-1">
          <span className="sr-only">{label}</span>
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-2.5 w-1/2" />
        </span>
      ) : null}
      {state === 'error' ? (
        <span className="my-1 inline-flex w-fit items-center gap-1 rounded-pill bg-status-problem-bg px-2 py-0.5 text-xs font-medium text-status-problem-text">
          <Icon name="status-problem" size={12} />
          {errorLabel}
        </span>
      ) : null}
      {state === 'ready' ? (
        <>
          <span className="font-heading text-2xl font-semibold text-heading tabular-nums">
            {value}
          </span>
          {note ? <span className="text-xs text-text-muted">{note}</span> : null}
        </>
      ) : null}
    </Link>
  );
}
