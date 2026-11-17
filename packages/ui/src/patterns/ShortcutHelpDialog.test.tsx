// Keyboard help lists each shortcut as a key (Role Home v2 design, rule E5).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ShortcutHelpDialog } from './ShortcutHelpDialog.js';

describe('ShortcutHelpDialog', () => {
  it('lists every shortcut with its key inside a labelled dialog', () => {
    render(
      <ShortcutHelpDialog
        open
        onOpenChange={() => undefined}
        title="Keyboard shortcuts"
        closeLabel="Close"
        shortcuts={[
          { label: 'Search patients', keys: '/' },
          { label: 'Show this help', keys: '?' },
        ]}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    const keys = Array.from(dialog.querySelectorAll('kbd')).map((key) => key.textContent);
    expect(keys).toEqual(['/', '?']);
    expect(dialog.textContent).toContain('Search patients');
  });
});
