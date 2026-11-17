// Empty, load-error and loading states of a list (Role Home v2 design, States and Inventory).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState.js';
import { LoadErrorAlert } from './LoadErrorAlert.js';
import { SkeletonRows } from './SkeletonRows.js';

describe('EmptyState', () => {
  it('says what is missing and what to do next, politely', () => {
    render(<EmptyState title="No sessions this week." hint="Add a session as a draft." />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('No sessions this week.');
    expect(status.textContent).toContain('Add a session as a draft.');
  });

  it('offers the next action when one is given', () => {
    render(<EmptyState title="No users yet." action={<button type="button">Add user</button>} />);
    expect(screen.getByRole('button', { name: 'Add user' })).toBeTruthy();
  });
});

describe('LoadErrorAlert', () => {
  it('announces the failure and retries in place', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <LoadErrorAlert
        title="Could not load this list"
        message="Cannot reach the server."
        retryLabel="Try again"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Could not load this list');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('SkeletonRows', () => {
  it('is a busy status with a spoken label and one placeholder per row', () => {
    const { container } = render(<SkeletonRows label="Loading" rows={3} columns={4} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toBe('Loading');
    expect(container.querySelectorAll('[data-skeleton]')).toHaveLength(12);
  });
});
