import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Radio } from './Radio.js';

describe('Radio', () => {
  it('is named by its label and chosen from the label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Radio
        name="session"
        value="a"
        label="17:00 Karim Uddin"
        checked={false}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByText('17:00 Karim Uddin'));
    expect(screen.getByRole('radio', { name: '17:00 Karim Uddin' })).toBeDefined();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('cannot be chosen when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Radio name="session" value="b" label="Full" disabled onChange={onChange} />);
    await user.click(screen.getByText('Full'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
