'use client';
// Keyboard shortcuts of the signed-in shell (Role Home v2 design, rule E5: shortcuts are visible,
// never secret): "/" jumps to the patient search, "?" opens the list of shortcuts, Esc closes.
// A key typed into a field stays in the field, and a key with Ctrl, Alt or Cmd is left to the
// browser. The keyboard button opens the same list for mouse users. Implements: T-UI-02.
import { IconButton, type Shortcut, ShortcutHelpDialog } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PATIENT_SEARCH_ID } from './patient-search';

function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function ShellShortcuts({ canSearch }: { canSearch: boolean }) {
  const t = useTranslations();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey || typingInto(event.target)) return;
      if (event.key === '/' && canSearch) {
        const search = document.getElementById(PATIENT_SEARCH_ID);
        if (search) {
          event.preventDefault();
          search.focus();
        }
      } else if (event.key === '?') {
        event.preventDefault();
        setHelpOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canSearch]);

  const shortcuts: Shortcut[] = [
    ...(canSearch ? [{ label: t('shell.shortcutSearch'), keys: '/' }] : []),
    { label: t('shell.shortcutMove'), keys: 'Tab' },
    { label: t('shell.shortcutOpen'), keys: 'Enter' },
    { label: t('shell.shortcutClose'), keys: 'Esc' },
    { label: t('shell.shortcutHelp'), keys: '?' },
  ];

  return (
    <>
      {/* Phones have no keyboard to speak of: the button shows from the tablet tier up. */}
      <span className="hidden md:contents">
        <IconButton
          icon="keyboard"
          label={t('shell.shortcutsTitle')}
          variant="ghost"
          onClick={() => setHelpOpen(true)}
        />
      </span>
      <ShortcutHelpDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        shortcuts={shortcuts}
        title={t('shell.shortcutsTitle')}
        closeLabel={t('common.close')}
      />
    </>
  );
}
