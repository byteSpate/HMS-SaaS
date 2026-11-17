// The error page drawn inside the shell (Role Home v2 design, "Error page").
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorPage } from './ErrorPage.js';

describe('ErrorPage', () => {
  it('shows the badge, the title as the page heading, the steps in order and the reference', () => {
    render(
      <ErrorPage
        kind="offline"
        badge="No connection"
        title="No connection to the hospital server"
        body="Not sure yet if your last action was saved."
        stepsTitle="What you can do"
        steps={['Check the cable.', 'Ask the next desk.']}
        actions={<button type="button">Try again</button>}
        reference="Checking again every 10 seconds"
      />,
    );
    expect(screen.getByText('No connection')).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 1, name: 'No connection to the hospital server' }),
    ).toBeTruthy();
    const steps = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(steps).toEqual(['Check the cable.', 'Ask the next desk.']);
    expect(screen.getByText('Checking again every 10 seconds')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
