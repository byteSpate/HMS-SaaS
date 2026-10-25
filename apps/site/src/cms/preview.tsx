// Browser-only demo preview shares the public renderer. T-CMS-DEMO-01, C-092.
'use client';
import { useEffect, useState } from 'react';
import type { CmsSnapshot } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { Alert, Button, Field, Select } from '@hms/ui';
import { CmsDemoStore } from './demo-store';
import { cmsMessages } from './messages';
import { SectionList } from '../sections/registry';
import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import { TopBar } from '../components/top-bar';
import { PageHeader } from '../components/page-header';
import { localize } from '../content';
import { websiteThemeStyle } from './theme';
export function CmsPreview({ locale, published = false }: { locale: Locale; published?: boolean }) {
  const m = cmsMessages(locale);
  const [snapshot, setSnapshot] = useState<CmsSnapshot | null>(null);
  const [path, setPath] = useState('/');
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      const state = new CmsDemoStore(() => window.localStorage).read();
      const selected = published
        ? state.versions.find((version) => version.id === state.publishedId)?.snapshot
        : state.draft.snapshot;
      if (!selected) {
        setError(true);
        return;
      }
      setSnapshot(selected);
    } catch {
      setError(true);
    }
  }, [published]);
  if (error)
    return (
      <main className="p-6">
        <Alert tone="danger">{m.previewError}</Alert>
      </main>
    );
  if (!snapshot)
    return (
      <main className="p-6" role="status">
        {m.loading}
      </main>
    );
  const page = snapshot.pages.find((item) => item.path === path) ?? snapshot.pages[0];
  return (
    <div style={websiteThemeStyle(snapshot.site)} data-website-theme={snapshot.site.theme.preset}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-status-attention-bg p-4 text-status-attention-text">
        <p>{m.previewNote}</p>
        <Field label={m.selectPage}>
          {(control) => (
            <Select
              {...control}
              value={path}
              options={snapshot.pages.map((item) => ({
                value: item.path,
                label: localize(item.title, locale),
              }))}
              onChange={(e) => setPath(e.target.value)}
            />
          )}
        </Field>
        <Button
          variant="secondary"
          onClick={() => {
            window.location.href = `/cms/${locale === 'en' ? 'en' : 'bn'}`;
          }}
        >
          {m.closePreview}
        </Button>
      </div>
      <TopBar site={snapshot.site} locale={locale} />
      <SiteHeader site={snapshot.site} locale={locale} />
      <main>
        {page && page.path !== '/' ? <PageHeader title={localize(page.title, locale)} /> : null}
        {page ? (
          <SectionList sections={page.sections} locale={locale} site={snapshot.site} />
        ) : null}
      </main>
      <SiteFooter site={snapshot.site} locale={locale} />
    </div>
  );
}
