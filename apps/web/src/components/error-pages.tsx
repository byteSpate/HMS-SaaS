'use client';
// The three error pages of the staff app, with their catalog texts (Role Home v2 design, "Error
// page"): a server problem with Try again and a reference, a page that does not exist, and no
// connection to the server. They render inside the shell when it is there, so staff can still
// navigate and search. Implements: T-UI-02, F section 5.
import { Button, buttonClassName, ErrorPage } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

function HomeLink() {
  const t = useTranslations();
  return (
    <Link href="/" className={buttonClassName('secondary')}>
      {t('errorPage.backHome')}
    </Link>
  );
}

export function ProblemPage({ code, onRetry }: { code?: string; onRetry: () => void }) {
  const t = useTranslations();
  return (
    <ErrorPage
      kind="problem"
      badge={t('errorPage.problemBadge')}
      title={t('errorPage.problemTitle')}
      body={t('errorPage.problemBody')}
      stepsTitle={t('errorPage.stepsTitle')}
      steps={[
        t('errorPage.problemStep1'),
        t('errorPage.problemStep2'),
        t('errorPage.problemStep3'),
      ]}
      actions={
        <>
          <Button onClick={onRetry}>{t('errorPage.tryAgain')}</Button>
          <HomeLink />
        </>
      }
      reference={code ? t('errorPage.problemReference', { code }) : undefined}
    />
  );
}

export function NotFoundPage() {
  const t = useTranslations();
  return (
    <ErrorPage
      kind="not-found"
      badge={t('errorPage.notFoundBadge')}
      title={t('errorPage.notFoundTitle')}
      body={t('errorPage.notFoundBody')}
      stepsTitle={t('errorPage.stepsTitle')}
      steps={[
        t('errorPage.notFoundStep1'),
        t('errorPage.notFoundStep2'),
        t('errorPage.notFoundStep3'),
      ]}
      actions={<HomeLink />}
      reference={t('errorPage.notFoundReference')}
    />
  );
}

/** No shell here: the session could not be read, so the menu is not known yet. */
export function OfflinePage({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations();
  return (
    <main id="main-content" className="min-h-dvh bg-bg">
      <ErrorPage
        kind="offline"
        badge={t('errorPage.offlineBadge')}
        title={t('errorPage.offlineTitle')}
        body={t('errorPage.offlineBody')}
        stepsTitle={t('errorPage.stepsTitle')}
        steps={[
          t('errorPage.offlineStep1'),
          t('errorPage.offlineStep2'),
          t('errorPage.offlineStep3'),
        ]}
        actions={<Button onClick={onRetry}>{t('errorPage.tryAgain')}</Button>}
        reference={t('errorPage.offlineReference')}
      />
    </main>
  );
}
