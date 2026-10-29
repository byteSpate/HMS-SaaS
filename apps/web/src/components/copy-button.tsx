'use client';
// Copies a text to the clipboard and says so (first used for the MFA recovery codes, T-ACC-04).
// The result is announced in a live region, so screen-reader users hear it too. The clipboard
// API exists only in secure contexts (HTTPS, localhost); elsewhere the button reports failure
// and the person copies the text by hand.
import { Button } from '@hms/ui';
import { useEffect, useState } from 'react';

const RESET_AFTER_MS = 3000;

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyButton({
  text,
  label,
  copiedLabel,
  failedLabel,
}: {
  text: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
}) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state !== 'copied') return;
    const timer = setTimeout(() => setState('idle'), RESET_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" size="lg" onClick={() => void copy()}>
        {state === 'copied' ? copiedLabel : label}
      </Button>
      <p role="status" className="text-sm text-text-muted">
        {state === 'failed' ? failedLabel : ''}
      </p>
    </div>
  );
}
