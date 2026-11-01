'use client';
// Password field with a button that shows or hides what was typed (T-ACC-05, FR-ACC-001, C-093).
// Hidden by default. The labels are required props because primitives carry no text. Spell check
// and auto-capitalize stay off, or a browser could send a revealed password to a spelling service.
import { useState } from 'react';
import { cx } from '../utils/cx.js';
import { IconButton } from './Button.js';
import { TextInput, type TextInputProps } from './TextInput.js';

export interface PasswordInputProps extends Omit<TextInputProps, 'type'> {
  showLabel: string;
  hideLabel: string;
}

export function PasswordInput({
  showLabel,
  hideLabel,
  className,
  disabled,
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <TextInput
        {...rest}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cx('pe-10', className)}
      />
      <IconButton
        icon={visible ? 'eye-slash' : 'eye'}
        label={visible ? hideLabel : showLabel}
        disabled={disabled}
        className="absolute inset-y-0 end-0 text-text-muted"
        onClick={() => setVisible((current) => !current)}
      />
    </div>
  );
}
