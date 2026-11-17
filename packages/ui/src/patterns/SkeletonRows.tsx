// Loading placeholder shaped like the rows that will arrive, so the page does not jump when the
// list lands (Role Home v2 design, "skeleton shaped like the rows"). The region carries the
// spoken status; the bars are decorative. Below the desktop tier rows stack, so the placeholder
// shows two columns there. Implements: T-UI-02, ADR-022 section 13, NFR-ACC-001.
import type { CSSProperties } from 'react';
import { Skeleton } from '../primitives/Skeleton.js';
import { cx } from '../utils/cx.js';

export interface SkeletonRowsProps {
  /** Spoken while loading, already translated ("Loading"). */
  label: string;
  rows?: number;
  columns?: number;
  className?: string;
}

// Varied bar widths read as text rather than a solid block.
const WIDTHS = ['70%', '55%', '80%', '60%', '75%', '50%'];

export function SkeletonRows({ label, rows = 5, columns = 4, className }: SkeletonRowsProps) {
  const grid = { '--skeleton-columns': `repeat(${columns}, minmax(0, 1fr))` } as CSSProperties;
  return (
    <div
      role="status"
      aria-busy="true"
      className={cx('overflow-hidden rounded-panel border border-border bg-surface', className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          style={grid}
          className="grid grid-cols-2 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 xl:grid-cols-(--skeleton-columns)"
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cx('h-2.5', column >= 2 ? 'hidden xl:block' : null)}
              style={{ width: WIDTHS[(row + column) % WIDTHS.length] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
