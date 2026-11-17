// Empty state for a list or a panel: one line saying what goes here, one line saying what to do
// next, and an optional action. An empty list is not an error and not "no results": it tells
// staff how the list fills (Role Home v2 design, States and Inventory sheet). Polite status, so
// a screen reader hears it once the list settles. Implements: T-UI-02, NFR-ACC-001.
import type { ReactNode } from 'react';
import { Icon } from '../icons/Icon.js';
import { cx } from '../utils/cx.js';

export interface EmptyStateProps {
  /** What is missing, already translated ("No sessions this week."). */
  title: string;
  /** The next step, already translated ("Add a session as a draft, then publish it."). */
  hint?: string;
  /** One button or link for the next step. */
  action?: ReactNode;
  /** False inside a panel that already draws the frame (a role home work panel). */
  framed?: boolean;
  className?: string;
}

export function EmptyState({ title, hint, action, framed = true, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cx(
        'flex flex-col items-start gap-2 px-4 py-5',
        framed ? 'rounded-panel border border-border bg-surface' : null,
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <Icon name="info" className="shrink-0 text-text-muted" />
        {title}
      </p>
      {hint ? <p className="text-text-muted">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
