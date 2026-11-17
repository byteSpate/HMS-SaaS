'use client';
// Home: the role home (Role Home v2 design; F section 2.1). One tab per kind of work the user's
// permissions allow (front desk, doctor, finance, administration), each with its numbers and work
// lists; a user with one kind of work sees no tabs. The context strip says which hospital and day
// the numbers are for and when they were last read. The chosen tab is remembered on this device.
// Implements: T-UI-03, T-UI-02, FR-ACC-009.
import { PageLayout, Tabs } from '@hms/ui';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { tenantName } from '../../src/components/app-frame';
import { AdminHome } from '../../src/components/home/admin-home';
import { DoctorHome } from '../../src/components/home/doctor-home';
import { FinanceHome } from '../../src/components/home/finance-home';
import { ContextStrip } from '../../src/components/home/home-parts';
import { type HomeView, homeViews } from '../../src/components/home/home-rules';
import { ReceptionHome } from '../../src/components/home/reception-home';
import { useCachedSession } from '../../src/session/use-session';

const VIEW_STORAGE_KEY = 'hms.home-view';

// Full catalog keys as literals, so the unused-key check can see them.
const VIEW_LABEL_KEYS = {
  reception: 'home.viewReception',
  doctor: 'home.viewDoctor',
  finance: 'home.viewFinance',
  admin: 'home.viewAdmin',
} as const satisfies Record<HomeView, string>;

/** A per-device convenience: the page works the same when storage is blocked. */
function useRememberedView(views: readonly HomeView[]) {
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => {
    try {
      setStored(window.localStorage.getItem(VIEW_STORAGE_KEY));
    } catch {
      // storage blocked: start on the first view
    }
  }, []);
  function choose(next: string): void {
    setStored(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice lasts for this page view only
    }
  }
  const view = views.find((id) => id === stored) ?? views[0];
  return [view, choose] as const;
}

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();
  const session = useCachedSession();
  const permissions = session?.permissions;
  const granted = useMemo<ReadonlySet<string>>(() => new Set(permissions ?? []), [permissions]);
  const views = useMemo(() => homeViews(granted), [granted]);
  const [view, setView] = useRememberedView(views);
  // One clock for every view, so all counts agree about "now".
  const [now] = useState(() => new Date());

  if (!session) return null;

  // Only the chosen view is rendered: Tabs keeps hidden panels mounted, and each view reads data.
  const contentOf = (id: HomeView): ReactNode => {
    if (id !== view) return null;
    if (id === 'reception') return <ReceptionHome granted={granted} now={now} />;
    if (id === 'doctor') return <DoctorHome now={now} />;
    if (id === 'finance') return <FinanceHome granted={granted} />;
    return <AdminHome granted={granted} now={now} />;
  };

  return (
    <PageLayout
      title={t('home.title')}
      description={t('home.welcome', { name: session.user.displayName })}
    >
      <div className="flex flex-col gap-4">
        <ContextStrip hospital={tenantName(session, locale)} />
        {views.length === 0 ? (
          <p className="max-w-xl rounded-panel border border-border bg-surface p-5 text-text-muted">
            {t('home.nothingYet')}
          </p>
        ) : null}
        {views.length === 1 && views[0] ? contentOf(views[0]) : null}
        {views.length > 1 ? (
          <Tabs
            label={t('home.viewsLabel')}
            value={view}
            onValueChange={setView}
            tabs={views.map((id) => ({
              id,
              label: t(VIEW_LABEL_KEYS[id]),
              content: contentOf(id),
            }))}
          />
        ) : null}
      </div>
    </PageLayout>
  );
}
