// A keyboard key drawn as a small accent chip, beside the action or field it triggers and in the
// keyboard help (Role Home v2 design, "Shortcut chip"; accent is reserved for shortcut chips,
// ADR-022 section 2). A <kbd>, so assistive technology reads it as a key. Implements: T-UI-02.
import type { ReactNode } from 'react';
import { cx } from '../utils/cx.js';

export interface ShortcutKeyProps {
  children: ReactNode;
  className?: string;
}

export function ShortcutKey({ children, className }: ShortcutKeyProps) {
  return (
    <kbd
      className={cx(
        'inline-flex h-5 items-center rounded-[4px] bg-accent-soft px-1.5 font-ui text-xs font-medium text-accent',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
