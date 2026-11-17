'use client';
// Small pieces every role view of the home shares (Role Home v2 design): a tile wired to Next's
// router, the tile state derived from a query, the "View all" link, the reader's digits, and the
// context strip that says which hospital and day the numbers are for and how fresh they are.
// Implements: T-UI-03, F section 8 (freshness is visible, never assumed).
import { formatDate, formatTimeOfDay, toLocaleDigits, type Locale } from '@hms/i18n';
import {
  Button,
  KpiTile,
  type KpiTileProps,
  type KpiTileState,
  type ShellLinkProps,
} from '@hms/ui';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type ComponentType, type ReactNode, useState } from 'react';

const NextLink: ComponentType<ShellLinkProps> = (props) => <Link {...props} />;

export function HomeTile(props: Omit<KpiTileProps, 'linkComponent' | 'errorLabel'>) {
  const t = useTranslations();
  return <KpiTile {...props} errorLabel={t('home.tileError')} linkComponent={NextLink} />;
}

/** Loading until the first answer, error when there is none, otherwise ready. */
export function tileState(query: {
  data: unknown;
  error: unknown;
  isLoading: boolean;
}): KpiTileState {
  if (query.data !== undefined) return 'ready';
  return query.error ? 'error' : 'loading';
}

export function ViewAllLink({ href }: { href: string }) {
  const t = useTranslations();
  return (
    <Link href={href} className="font-medium text-primary underline-offset-2 hover:underline">
      {t('home.viewAll')}
    </Link>
  );
}

export function useDigits(): (value: number | string) => string {
  const locale = useLocale() as Locale;
  return (value) => toLocaleDigits(String(value), locale);
}

/** Four tiles on a desktop, two on smaller screens (design: KPI row). */
export function TileRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</div>;
}

/** The hospital, today's date, when the numbers were last read, and Refresh. */
export function ContextStrip({ hospital }: { hospital: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  async function refresh(): Promise<void> {
    await queryClient.refetchQueries({ type: 'active' });
    setUpdatedAt(new Date());
  }

  const time = formatTimeOfDay(updatedAt, locale).slice(0, -3);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-muted">
      <span className="font-medium text-text">{hospital}</span>
      <span aria-hidden="true">|</span>
      <span>{t('home.today', { date: formatDate(new Date(), locale) })}</span>
      <span aria-hidden="true">|</span>
      <span role="status">{fetching ? t('home.checking') : t('home.lastUpdated', { time })}</span>
      <Button variant="secondary" onClick={() => void refresh()} disabled={fetching}>
        {t('home.refresh')}
      </Button>
    </div>
  );
}
