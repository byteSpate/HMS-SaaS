'use client';
// A list or panel that could not load: plain words, the reason, and Try again in place, so the
// person stays where they were (Role Home v2 design, "Error: plain words plus Retry, inline").
// Announced at once (role=alert). Implements: T-UI-02, NFR-ACC-001.
import { Icon } from '../icons/Icon.js';
import { Button } from '../primitives/Button.js';
import { cx } from '../utils/cx.js';

export interface LoadErrorAlertProps {
  /** Texts, already translated. */
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
  /** True while the retry is under way: the button shows it is busy. */
  retrying?: boolean;
  className?: string;
}

export function LoadErrorAlert({
  title,
  message,
  retryLabel,
  onRetry,
  retrying = false,
  className,
}: LoadErrorAlertProps) {
  return (
    <div
      role="alert"
      className={cx(
        'flex flex-col items-start gap-2 rounded-control bg-status-problem-bg px-4 py-3 font-ui text-status-problem-text',
        className,
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <Icon name="status-problem" className="shrink-0" />
        {title}
      </p>
      <p>{message}</p>
      <Button variant="secondary" loading={retrying} onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
