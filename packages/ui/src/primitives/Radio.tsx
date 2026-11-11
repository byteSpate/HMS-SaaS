'use client';
// Radio button with its label as one click target (T-SCH-02 session picker). Native input, so the
// arrow keys move within a group of the same name and screen readers announce it without extra
// code; the dot uses the primary colour token. F section 7.1: the label is always visible text.
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cx } from '../utils/cx.js';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export function Radio({ label, className, disabled, ref, ...rest }: RadioProps) {
  return (
    <label
      className={cx(
        'flex min-h-8 items-center gap-2',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className,
      )}
    >
      <input
        ref={ref}
        type="radio"
        disabled={disabled}
        className="size-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed"
        {...rest}
      />
      <span>{label}</span>
    </label>
  );
}
