// Browser-only demo state and commands. T-CMS-DEMO-01, C-092. Never sends network requests.
'use client';
import { useEffect, useState } from 'react';
import { cmsSnapshotSchema, type CmsDemoState, type CmsSnapshot } from '@hms/contracts';
import { CmsDemoError, CmsDemoStore } from './demo-store';
export function useDemoEditor(seed: CmsSnapshot) {
  const [store] = useState(() => new CmsDemoStore(() => window.localStorage));
  const [state, setState] = useState<CmsDemoState>({
    draft: { revision: 0, publishedRevision: null, snapshot: null },
    versions: [],
    publishedId: null,
  });
  const [snapshot, setSnapshot] = useState(seed);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<'saved' | 'published' | 'restored' | ''>('');
  function accept(next: CmsDemoState) {
    setState(next);
    setSnapshot(next.draft.snapshot ?? structuredClone(seed));
    setDirty(next.draft.snapshot === null);
  }
  function run(action: () => CmsDemoState, success: typeof message = '') {
    try {
      const next = action();
      accept(next);
      setError('');
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof CmsDemoError ? reason.code : 'UNKNOWN');
      setMessage('');
    }
  }
  useEffect(() => {
    run(() => store.read());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    function preventLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', preventLeave);
    return () => window.removeEventListener('beforeunload', preventLeave);
  }, [dirty]);
  function change(next: CmsSnapshot) {
    setSnapshot(next);
    setDirty(true);
    setMessage('');
  }
  return {
    state,
    snapshot,
    loaded,
    dirty,
    error,
    message,
    parsed: cmsSnapshotSchema.safeParse(snapshot),
    change,
    reload: () => run(() => store.read()),
    reset: () => run(() => store.reset()),
    save: () => run(() => store.save(snapshot, state.draft.revision), 'saved'),
    publish: () => run(() => store.publish(state.draft.revision), 'published'),
    restore: (id: string) => run(() => store.restore(id, state.draft.revision), 'restored'),
  };
}
export type DemoEditor = ReturnType<typeof useDemoEditor>;
