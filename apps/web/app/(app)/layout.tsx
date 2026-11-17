'use client';
// Everything inside the signed-in shell. The guard sends a signed-out visitor to login and a user
// without a chosen hospital to the hospital list. A lost connection shows the no-connection page
// and reads the session again every 10 seconds, so the screen comes back by itself (Role Home v2
// design, "Error page", offline). Any other failure keeps its own message, so a rate limit does
// not read as a lost connection (T-ACC-06). Implements: T-UI-02, F section 2.1.
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef } from 'react';
import { ApiError, CLIENT_ERROR_CODES } from '../../src/api/errors';
import { AppFrame } from '../../src/components/app-frame';
import { OfflinePage } from '../../src/components/error-pages';
import { FullScreenStatus } from '../../src/components/full-screen-status';
import { useApiErrorMessage } from '../../src/i18n/use-api-error-message';
import { useAccess } from '../../src/session/use-access';

const RECHECK_MS = 10_000;

const isNetworkError = (error: unknown) =>
  error instanceof ApiError && error.code === CLIENT_ERROR_CODES.NETWORK;

export default function SignedInLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const access = useAccess('hospital');
  const offline = access.status === 'unreachable' && isNetworkError(access.error);
  // The latest retry, so the timer does not restart on every render.
  const retryRef = useRef(access.retry);
  retryRef.current = access.retry;

  useEffect(() => {
    if (!offline) return;
    const timer = window.setInterval(() => retryRef.current(), RECHECK_MS);
    return () => window.clearInterval(timer);
  }, [offline]);

  if (offline) return <OfflinePage onRetry={access.retry} />;
  if (access.status === 'unreachable') {
    return (
      <FullScreenStatus>
        <span className="flex flex-col items-center gap-4">
          <span>{errorMessage(access.error)}</span>
          <Button variant="secondary" onClick={access.retry}>
            {t('common.retry')}
          </Button>
        </span>
      </FullScreenStatus>
    );
  }
  if (access.status !== 'ready' || !access.session) {
    return <FullScreenStatus>{t('common.loading')}</FullScreenStatus>;
  }
  return <AppFrame session={access.session}>{children}</AppFrame>;
}
