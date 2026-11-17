'use client';
// The four states every list screen shows the same way (Role Home v2 design, States and
// Inventory sheet): loading as rows shaped like the table, a load failure in plain words with
// Try again in place, an empty list that says how it fills, and the list itself. Screens pass
// the query and the rendering of the loaded data; they write none of the states.
// Implements: T-UI-02, F section 8.
import { EmptyState, LoadErrorAlert, SkeletonRows } from '@hms/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useApiErrorMessage } from '../i18n/use-api-error-message';

/** The part of a TanStack Query result this view reads. */
export interface ListQuery<T> {
  data: T | undefined;
  error: unknown;
  /** Fetching with nothing to show yet. Not `isPending`: a disabled query stays pending. */
  isLoading: boolean;
  isRefetching: boolean;
  refetch: () => unknown;
}

export interface QueryViewProps<T> {
  query: ListQuery<T>;
  /** Omitted for a list that can never be empty (the users list always holds its reader). */
  isEmpty?: (data: T) => boolean;
  /** Texts already translated; the action is the screen's next step, if it has one. */
  empty?: { title: string; hint?: string; action?: ReactNode };
  /** Columns of the loading placeholder, to match the table that will arrive. */
  columns?: number;
  /** Inside a WorkPanel: the panel draws the frame, so the states draw none. */
  inPanel?: boolean;
  children: (data: T) => ReactNode;
}

export function QueryView<T>({
  query,
  isEmpty,
  empty,
  columns,
  inPanel = false,
  children,
}: QueryViewProps<T>) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const failure = query.error ? (
    <LoadErrorAlert
      title={t('states.loadErrorTitle')}
      message={errorMessage(query.error)}
      retryLabel={t('common.retry')}
      retrying={query.isRefetching}
      onRetry={() => void query.refetch()}
      className={inPanel ? 'm-4' : undefined}
    />
  ) : null;

  if (query.data === undefined) {
    if (failure) return failure;
    if (query.isLoading) {
      return (
        <SkeletonRows
          label={t('states.loading')}
          columns={columns}
          rows={inPanel ? 3 : 5}
          framed={!inPanel}
        />
      );
    }
    return null;
  }
  // A failed refresh keeps the rows already on screen and says so above them.
  return (
    <div className="flex flex-col gap-3">
      {failure}
      {empty && isEmpty?.(query.data) ? (
        <EmptyState title={empty.title} hint={empty.hint} action={empty.action} framed={!inPanel} />
      ) : (
        children(query.data)
      )}
    </div>
  );
}
