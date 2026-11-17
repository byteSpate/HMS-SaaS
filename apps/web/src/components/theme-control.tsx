'use client';
// Light / dark switch in the top bar (Role Home v2 design; C-055 switched on by the product owner
// on 2026-11-17). The button names the theme it switches to, so the label is never a riddle.
// The choice stays on this device only (ADR-022 section 4). Implements: T-UI-02.
import { IconButton, readStoredTheme, storeTheme, type Theme } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ThemeControl() {
  const t = useTranslations();
  const [theme, setTheme] = useState<Theme>('light');

  // The head script already applied the stored theme; this only syncs the button to it.
  useEffect(() => setTheme(readStoredTheme()), []);

  function toggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    storeTheme(next);
    setTheme(next);
  }

  return (
    <IconButton
      icon={theme === 'dark' ? 'sun' : 'moon'}
      label={theme === 'dark' ? t('shell.themeLight') : t('shell.themeDark')}
      variant="ghost"
      onClick={toggle}
    />
  );
}
