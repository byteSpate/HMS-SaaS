'use client';
// Status as word plus icon plus color, never color alone (F section 1 rule 5, NFR-ACC-001).
// Implements: T-UI-01, ADR-022 section 3, C-055. The icon takes the text color because the
// lighter shades fail 3:1 on their fills.
import { Icon, type IconName } from '../icons/Icon.js';
import { cx } from '../utils/cx.js';

export type StatusKind = 'idle' | 'active' | 'review' | 'attention' | 'done' | 'problem';

const STYLES: Record<StatusKind, string> = {
  idle: 'bg-status-idle-bg text-status-idle-text',
  active: 'bg-status-active-bg text-status-active-text',
  review: 'bg-status-review-bg text-status-review-text',
  attention: 'bg-status-attention-bg text-status-attention-text',
  done: 'bg-status-done-bg text-status-done-text',
  problem: 'bg-status-problem-bg text-status-problem-text',
};

export type StatusBadgeSize = 'sm' | 'md';

// sm is for dense tables (SCR-22 administration lists); md everywhere else.
const SIZES: Record<StatusBadgeSize, { box: string; icon: number }> = {
  sm: { box: 'gap-1 px-2 py-0.5 text-xs', icon: 12 },
  md: { box: 'gap-1.5 px-2.5 py-0.5 text-sm', icon: 16 },
};

const ICONS: Record<StatusKind, IconName> = {
  idle: 'status-idle',
  active: 'status-active',
  review: 'status-review',
  attention: 'status-attention',
  done: 'status-done',
  problem: 'status-problem',
};

export interface StatusBadgeProps {
  status: StatusKind;
  /** The visible word, already translated. Required: the word is part of the status. */
  label: string;
  size?: StatusBadgeSize;
  className?: string;
}

export function StatusBadge({ status, label, size = 'md', className }: StatusBadgeProps) {
  return (
    <span
      data-status={status}
      className={cx(
        'inline-flex items-center rounded-pill font-ui font-medium',
        SIZES[size].box,
        STYLES[status],
        className,
      )}
    >
      <Icon name={ICONS[status]} size={SIZES[size].icon} />
      <span>{label}</span>
    </span>
  );
}
