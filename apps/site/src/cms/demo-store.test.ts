// Demo persistence boundaries, stale-tab safety, validation and storage failure recovery.
// Implements: T-CMS-DEMO-01, C-092. Every fixture is fictional.
import { beforeEach, describe, expect, it } from 'vitest';
import { cmsSnapshotSchema, type CmsSnapshot } from '@hms/contracts';
import { content } from '../content/load';
import { CMS_DEMO_KEY, CmsDemoError, CmsDemoStore, type DemoStorage } from './demo-store';
const seed = (): CmsSnapshot =>
  cmsSnapshotSchema.parse({ site: content.site, pages: Object.values(content.pages) });
describe('browser-only CMS demo', () => {
  let values: Map<string, string>;
  let storage: DemoStorage;
  let store: CmsDemoStore;
  beforeEach(() => {
    values = new Map();
    storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    store = new CmsDemoStore(() => storage);
  });
  it('keeps drafts separate from immutable demo publications and persists across reload', () => {
    const original = seed();
    expect(store.read().draft.snapshot).toBeNull();
    expect(store.save(original, 0).draft.revision).toBe(1);
    const first = store.publish(1);
    expect(store.publish(1).versions).toHaveLength(1);
    const changed = seed();
    changed.site.settings.hospitalName.en = 'Fictional Revised Hospital';
    store.save(changed, 1);
    expect(store.read().versions[0]?.snapshot.site.settings.hospitalName.en).toBe(
      original.site.settings.hospitalName.en,
    );
    const reloaded = new CmsDemoStore(() => storage);
    expect(reloaded.read().draft.snapshot?.site.settings.hospitalName.en).toBe(
      'Fictional Revised Hospital',
    );
    const restored = reloaded.restore(first.versions[0]!.id, 2);
    expect(restored.draft.revision).toBe(3);
    expect(restored.draft.snapshot).toEqual(original);
    expect(restored.publishedId).toBe(first.publishedId);
    expect(restored.draft.publishedRevision).toBe(1);
    expect(store.reset().draft.revision).toBe(0);
    expect(values.size).toBe(0);
  });
  it('refuses stale saves, stale publications and stale restoration', () => {
    store.save(seed(), 0);
    const version = store.publish(1).versions[0]!;
    store.save(seed(), 1);
    for (const action of [
      () => store.save(seed(), 1),
      () => store.publish(1),
      () => store.restore(version.id, 1),
    ])
      expect(action).toThrow('STALE_RECORD');
    expect(store.read().draft.revision).toBe(2);
  });
  it('does not destroy the previous state if a write exceeds browser storage', () => {
    const saved = store.save(seed(), 0);
    const blocked = new CmsDemoStore(() => ({
      ...storage,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    }));
    expect(() => blocked.publish(1)).toThrow('STORAGE');
    expect(store.read()).toEqual(saved);
  });
  it('detects corrupt storage and can reset without parsing it', () => {
    values.set(CMS_DEMO_KEY, '{invalid');
    expect(() => store.read()).toThrow('INVALID_DEMO');
    expect(store.reset().versions).toEqual([]);
    const denied = new CmsDemoStore(() => {
      throw new Error('SecurityError');
    });
    expect(() => denied.read()).toThrow(CmsDemoError);
  });
  it('rejects script links, missing translations, unknown sections, unsafe colors and reserved paths', () => {
    const badLink = seed();
    badLink.site.navigation.header[0]!.href = 'javascript:alert(1)';
    expect(cmsSnapshotSchema.safeParse(badLink).success).toBe(false);
    const missing = seed();
    missing.site.settings.hospitalName.bn = '';
    expect(cmsSnapshotSchema.safeParse(missing).success).toBe(false);
    const badSection = seed();
    (badSection.pages[0]!.sections[0] as { type: string }).type = 'rawHtml';
    expect(cmsSnapshotSchema.safeParse(badSection).success).toBe(false);
    const badColor = seed();
    badColor.site.theme.primaryOverride = '#ffffff';
    expect(cmsSnapshotSchema.safeParse(badColor).success).toBe(false);
    for (const path of ['/cms', '/staff', '/doctors', '/api/v1', '/search']) {
      const reserved = seed();
      reserved.pages.push({ ...reserved.pages[0]!, path });
      expect(cmsSnapshotSchema.safeParse(reserved).success).toBe(false);
    }
  });
  it('retains the latest 20 publications and never mutates the seed', () => {
    const original = seed();
    // Retention depends on version count, not on the size of the fictional home page.
    original.pages.forEach((page) => {
      page.sections = [];
    });
    const copy = structuredClone(original);
    for (let revision = 0; revision < 22; revision++) {
      store.save(original, revision);
      store.publish(revision + 1);
    }
    expect(store.read().versions).toHaveLength(20);
    expect(store.read().versions[0]?.revision).toBe(22);
    expect(original).toEqual(copy);
  });
});
