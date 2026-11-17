'use client';
// Keyboard help: the shortcuts of the current screen in a dialog, opened with "?" and closed with
// Esc (Role Home v2 design, "Keyboard help overlay"). Shortcuts must be visible, not secret
// (design rule E5), so each key is drawn as the same chip used beside actions.
// Implements: T-UI-02, NFR-ACC-001.
import { Button } from '../primitives/Button.js';
import { Dialog } from '../primitives/Dialog.js';
import { ShortcutKey } from '../primitives/ShortcutKey.js';

export interface Shortcut {
  /** What the key does, already translated. */
  label: string;
  /** The key as printed on the keyboard: "/", "?", "Esc". */
  keys: string;
}

export interface ShortcutHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: readonly Shortcut[];
  /** Texts, already translated. */
  title: string;
  closeLabel: string;
}

export function ShortcutHelpDialog({
  open,
  onOpenChange,
  shortcuts,
  title,
  closeLabel,
}: ShortcutHelpDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      closeLabel={closeLabel}
      size="sm"
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          {closeLabel}
        </Button>
      }
    >
      <dl className="flex flex-col">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.keys}
            className="flex items-center justify-between gap-3 border-b border-border py-1.5 last:border-b-0"
          >
            <dt>{shortcut.label}</dt>
            <dd>
              <ShortcutKey>{shortcut.keys}</ShortcutKey>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
