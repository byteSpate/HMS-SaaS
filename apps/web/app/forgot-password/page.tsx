'use client';
// Ask an administrator for a new password while signed out (C-093, FR-ACC-012). Implements: T-ACC-05.
import { Alert, AuthLayout, Button } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { Brand } from '../../src/components/brand';
import { ForgotPasswordForm } from '../../src/components/forgot-password-form';
import { FullScreenStatus } from '../../src/components/full-screen-status';
import { LanguageControl } from '../../src/components/language-control';
import { useAccess } from '../../src/session/use-access';

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const access = useAccess('anonymous');

  if (access.status === 'loading' || access.status === 'redirecting') {
    return <FullScreenStatus>{t('common.loading')}</FullScreenStatus>;
  }

  return (
    <AuthLayout brand={<Brand name={t('app.name')} />} topEnd={<LanguageControl />}>
      {access.status === 'unreachable' ? (
        <div className="flex flex-col gap-4">
          <Alert tone="danger">{t('errors.offline')}</Alert>
          <Button variant="secondary" onClick={access.retry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <ForgotPasswordForm />
      )}
    </AuthLayout>
  );
}
