'use client';
// SCR-01 (second factor): set up or enter the second factor after password and hospital, for a
// role that needs it (T-ACC-04; FR-ACC-006; C-032). The API refuses every guarded route with
// MFA_REQUIRED until this is done; the screen is the way through, not the control.
import { Alert, AuthLayout, Button } from '@hms/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Brand } from '../../src/components/brand';
import { FullScreenStatus } from '../../src/components/full-screen-status';
import { LanguageControl } from '../../src/components/language-control';
import { MfaSetup } from '../../src/components/mfa-setup';
import { MfaVerifyForm } from '../../src/components/mfa-verify-form';
import { useAccess } from '../../src/session/use-access';
import { useSessionActions } from '../../src/session/use-session';

export default function MfaPage() {
  const t = useTranslations();
  const router = useRouter();
  const access = useAccess('second-factor');
  const { logout } = useSessionActions();

  if (access.status === 'unreachable') {
    return (
      <AuthLayout brand={<Brand name={t('app.name')} />} topEnd={<LanguageControl />}>
        <div className="flex flex-col gap-4">
          <Alert tone="danger">{t('errors.offline')}</Alert>
          <Button variant="secondary" onClick={access.retry}>
            {t('common.retry')}
          </Button>
        </div>
      </AuthLayout>
    );
  }
  if (access.status !== 'ready' || !access.session) {
    return <FullScreenStatus>{t('common.loading')}</FullScreenStatus>;
  }

  return (
    <AuthLayout brand={<Brand name={t('app.name')} />} topEnd={<LanguageControl />}>
      <div className="flex flex-col gap-4">
        {access.session.mfa.enrolled ? <MfaVerifyForm /> : <MfaSetup />}
        <Button
          variant="secondary"
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace('/login') })}
        >
          {t('common.signOut')}
        </Button>
      </div>
    </AuthLayout>
  );
}
