// Show and hide behavior of the password field (T-ACC-05, C-093).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordInput, type PasswordInputProps } from './PasswordInput.js';

afterEach(cleanup);

function setup(props: Partial<PasswordInputProps> = {}): HTMLInputElement {
  render(
    <>
      <label htmlFor="secret">Secret</label>
      <PasswordInput
        id="secret"
        showLabel="Show"
        hideLabel="Hide"
        defaultValue="typed value"
        {...props}
      />
    </>,
  );
  return screen.getByLabelText<HTMLInputElement>('Secret');
}

describe('PasswordInput', () => {
  it('starts hidden and offers to show', () => {
    expect(setup().type).toBe('password');
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
  });

  it('shows the value and offers to hide it again, keeping what was typed', () => {
    const input = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(input.type).toBe('text');
    expect(input.value).toBe('typed value');
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(input.type).toBe('password');
  });

  it('does not submit the form when the button is pressed', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput aria-label="Other" showLabel="Reveal" hideLabel="Conceal" />
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps spell check off so a revealed value is not sent to a spelling service', () => {
    expect(setup().getAttribute('spellcheck')).toBe('false');
  });

  it('cannot be revealed while disabled', () => {
    setup({ disabled: true });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Show' }).disabled).toBe(true);
  });
});
