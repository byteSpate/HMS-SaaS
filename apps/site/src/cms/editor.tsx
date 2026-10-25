// Site-owned demo CMS with fictional, browser-local content. T-CMS-DEMO-01, C-091, C-092.
'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { CmsSnapshot } from '@hms/contracts';
import { messages as sharedMessages, type Locale } from '@hms/i18n';
import {
  Alert,
  AppShell,
  Button,
  Icon,
  PageLayout,
  Select,
  Skeleton,
  type NavItem,
  type ShellLinkProps,
} from '@hms/ui';
import { cmsMessages, type CmsMessages } from './messages';
import { PageEditor } from './page-editor';
import { Validation } from './validation-view';
import { focusCmsField, type FieldPath } from './validation';
import { ValueEditor } from './value-editor';
import { DemoToolbar } from './toolbar';
import { VersionHistory } from './version-history';
import { useDemoEditor, type DemoEditor } from './use-demo-editor';
type Area = 'settings' | 'navigation' | 'pages' | 'history';
const NavigateContext = createContext<(area: Area) => void>(() => undefined);
function DemoNavLink({ href, ...props }: ShellLinkProps) {
  const navigate = useContext(NavigateContext);
  return <Button {...props} variant="ghost" onClick={() => navigate(href.slice(1) as Area)} />;
}

function errorText(code: string, m: CmsMessages) {
  if (code === 'STALE_RECORD') return m.stale;
  if (code === 'STORAGE') return m.storageError;
  if (code === 'INVALID_DEMO') return m.invalidDemo;
  return m.error;
}
function EditorArea({
  area,
  editor: e,
  seed,
  assets,
  messages: m,
  locale,
  focusPath,
}: {
  area: Area;
  focusPath: FieldPath;
  editor: DemoEditor;
  seed: CmsSnapshot;
  assets: string[];
  messages: CmsMessages;
  locale: Locale;
}) {
  const { snapshot } = e;
  if (area === 'history') return <VersionHistory editor={e} messages={m} locale={locale} />;
  if (area === 'pages') {
    const templates = [
      ...new Map(
        seed.pages.flatMap((page) => page.sections).map((section) => [section.type, section]),
      ).values(),
    ];
    return (
      <PageEditor
        snapshot={snapshot}
        focusPath={focusPath}
        locale={locale}
        templates={templates}
        assets={assets}
        messages={m}
        disabled={false}
        onChange={e.change}
      />
    );
  }
  if (area === 'settings')
    return (
      <ValueEditor
        path={['site']}
        template={{
          settings: seed.site.settings,
          theme: seed.site.theme,
          notice: seed.site.notice,
        }}
        value={{
          settings: snapshot.site.settings,
          theme: snapshot.site.theme,
          notice: snapshot.site.notice,
        }}
        messages={m}
        assets={assets}
        onChange={(next) =>
          e.change({
            ...snapshot,
            site: {
              ...snapshot.site,
              ...(next as Pick<CmsSnapshot['site'], 'settings' | 'theme' | 'notice'>),
            },
          })
        }
      />
    );
  return (
    <ValueEditor
      path={['site']}
      template={{ navigation: seed.site.navigation, footer: seed.site.footer }}
      value={{ navigation: snapshot.site.navigation, footer: snapshot.site.footer }}
      messages={m}
      assets={assets}
      onChange={(next) =>
        e.change({
          ...snapshot,
          site: {
            ...snapshot.site,
            ...(next as Pick<CmsSnapshot['site'], 'navigation' | 'footer'>),
          },
        })
      }
    />
  );
}
export function CmsEditor({
  seed,
  assets,
  initialLocale,
}: {
  seed: CmsSnapshot;
  assets: string[];
  initialLocale: Locale;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [area, setArea] = useState<Area>('pages');
  const [focusPath, setFocusPath] = useState<FieldPath>([]);
  const m = cmsMessages(locale);
  const e = useDemoEditor(seed);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function showField(path: FieldPath) {
    setFocusPath([...path]);
    if (path[0] === 'pages') setArea('pages');
    else if (path[1] === 'navigation' || path[1] === 'footer') setArea('navigation');
    else setArea('settings');
    focusCmsField(path);
  }
  const common = sharedMessages[locale];
  const nav: NavItem[] = [
    { id: 'pages', label: m.pages, href: '#pages', icon: 'file-text' },
    { id: 'settings', label: m.settings, href: '#settings', icon: 'hospital' },
    { id: 'navigation', label: m.navigation, href: '#navigation', icon: 'menu' },
    { id: 'history', label: m.history, href: '#history', icon: 'clock' },
  ];
  return (
    <NavigateContext value={setArea}>
      <AppShell
        brand={
          <span className="flex items-center gap-2 overflow-hidden font-semibold">
            <Icon name="hospital" className="shrink-0" />
            <span className="truncate">
              {locale === 'en' ? seed.site.settings.shortName.en : seed.site.settings.shortName.bn}
            </span>
          </span>
        }
        nav={nav}
        activeId={area}
        linkComponent={DemoNavLink}
        navLabel={m.title}
        skipLabel={common.app.skipToContent}
        collapseLabel={common.shell.collapseMenu}
        expandLabel={common.shell.expandMenu}
        moreLabel={common.nav.more}
        topBarEnd={
          <Select
            aria-label={m.language}
            value={locale}
            options={[
              { value: 'bn-BD', label: m.bangla },
              { value: 'en', label: m.english },
            ]}
            onChange={(event) => setLocale(event.target.value as Locale)}
          />
        }
      >
        <PageLayout
          title={m.title}
          description={m.intro}
          actions={
            <Button
              variant="ghost"
              onClick={() => {
                if (window.confirm(m.resetConfirm)) e.reset();
              }}
            >
              {m.reset}
            </Button>
          }
        >
          <div className="space-y-5">
            <Alert tone="info">{m.demoNotice}</Alert>
            {e.error ? <Alert tone="danger">{errorText(e.error, m)}</Alert> : null}
            {e.message ? <Alert tone="success">{m[e.message]}</Alert> : null}
            {!e.loaded ? (
              <div role="status">
                <p>{m.loading}</p>
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <>
                <DemoToolbar editor={e} messages={m} locale={locale} />
                <p className="text-sm text-text-muted">
                  {e.state.draft.revision === 0 ? m.starter : m.draftHelp}
                </p>
                <Validation editor={e} messages={m} onField={showField} locale={locale} />
                <section className="min-w-0 max-w-3xl space-y-5">
                  <h2 className="text-xl font-semibold">{m[area]}</h2>
                  <EditorArea
                    area={area}
                    focusPath={focusPath}
                    editor={e}
                    seed={seed}
                    assets={assets}
                    messages={m}
                    locale={locale}
                  />
                </section>
              </>
            )}
          </div>
        </PageLayout>
      </AppShell>
    </NavigateContext>
  );
}
