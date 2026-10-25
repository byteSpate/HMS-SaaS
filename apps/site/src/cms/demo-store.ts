// Fictional browser-only CMS storage. No API, accounts, database or production writes.
// Implements: T-CMS-DEMO-01, C-091, C-092; draft/publish/restore are demonstrations only.
import {
  cmsDemoStateSchema,
  cmsSnapshotSchema,
  type CmsDemoState,
  type CmsSnapshot,
} from '@hms/contracts';
export const CMS_DEMO_KEY = 'hms.cms.demo.v1';
export class CmsDemoError extends Error {
  constructor(readonly code: 'STALE_RECORD' | 'STORAGE' | 'INVALID_DEMO' | 'NOT_FOUND') {
    super(code);
  }
}
export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export class CmsDemoStore {
  constructor(private readonly storage: () => DemoStorage) {}
  read(): CmsDemoState {
    let raw: string | null;
    try {
      raw = this.storage().getItem(CMS_DEMO_KEY);
    } catch {
      throw new CmsDemoError('STORAGE');
    }
    if (!raw)
      return {
        draft: { revision: 0, publishedRevision: null, snapshot: null },
        versions: [],
        publishedId: null,
      };
    try {
      return cmsDemoStateSchema.parse(JSON.parse(raw));
    } catch {
      throw new CmsDemoError('INVALID_DEMO');
    }
  }
  save(snapshot: CmsSnapshot, expectedRevision: number): CmsDemoState {
    const state = this.read();
    if (state.draft.revision !== expectedRevision) throw new CmsDemoError('STALE_RECORD');
    const next = {
      ...state,
      draft: {
        ...state.draft,
        revision: expectedRevision + 1,
        snapshot: cmsSnapshotSchema.parse(snapshot),
      },
    };
    return this.write(next);
  }
  publish(expectedRevision: number): CmsDemoState {
    const state = this.read();
    if (state.draft.revision !== expectedRevision) throw new CmsDemoError('STALE_RECORD');
    if (!state.draft.snapshot) throw new CmsDemoError('NOT_FOUND');
    if (state.draft.publishedRevision === expectedRevision) return state;
    const version = {
      id: crypto.randomUUID(),
      revision: expectedRevision,
      publishedAt: new Date().toISOString(),
      snapshot: state.draft.snapshot,
    };
    return this.write({
      draft: { ...state.draft, publishedRevision: expectedRevision },
      publishedId: version.id,
      versions: [version, ...state.versions].slice(0, 20),
    });
  }
  restore(versionId: string, expectedRevision: number): CmsDemoState {
    const state = this.read();
    if (state.draft.revision !== expectedRevision) throw new CmsDemoError('STALE_RECORD');
    const version = state.versions.find((item) => item.id === versionId);
    if (!version) throw new CmsDemoError('NOT_FOUND');
    return this.write({
      ...state,
      draft: { ...state.draft, snapshot: version.snapshot, revision: expectedRevision + 1 },
    });
  }
  reset(): CmsDemoState {
    try {
      this.storage().removeItem(CMS_DEMO_KEY);
    } catch {
      throw new CmsDemoError('STORAGE');
    }
    return this.read();
  }
  private write(state: CmsDemoState): CmsDemoState {
    const valid = cmsDemoStateSchema.parse(state);
    try {
      this.storage().setItem(CMS_DEMO_KEY, JSON.stringify(valid));
    } catch {
      throw new CmsDemoError('STORAGE');
    }
    return valid;
  }
}
