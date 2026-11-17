// The frame of every list on a role home: a title, an optional "as of" or count line, a link to
// the full list, and the content (Role Home v2 design, "Work panel"). Its states come from the
// content (row skeleton, inline error with Try again, empty state). Implements: T-UI-03.
import { type ReactNode, useId } from 'react';
import { cx } from '../utils/cx.js';

export interface WorkPanelProps {
  /** Texts already translated. */
  title: string;
  subtitle?: string;
  /** Usually a "View all" link to the screen the panel summarises. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function WorkPanel({ title, subtitle, action, children, className }: WorkPanelProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cx(
        'flex min-w-0 flex-col overflow-hidden rounded-panel border border-border bg-surface',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2">
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {subtitle ? <span className="text-xs text-text-muted">{subtitle}</span> : null}
        {action ? <span className="ms-auto text-sm">{action}</span> : null}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}
