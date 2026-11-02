'use client';
// Everything inside the signed-in shell. The guard sends a signed-out visitor to login and a user
// without a chosen hospital to the hospital list. Implements: T-UI-02, F section 2.1.
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppFrame } from '../../src/components/app-frame';
import { FullScreenStatus } from '../../src/components/full-screen-status';
import { useApiErrorMessage } from '../../src/i18n/use-api-error-message';
import { useAccess } from '../../src/session/use-access';

export default function SignedInLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const errorMessage = useApiErrorMessage();
  const access = useAccess('hospital');

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
