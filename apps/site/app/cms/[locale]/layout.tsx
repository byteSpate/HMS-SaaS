// Independent CMS root: no public header/footer, no indexing. T-CMS-03, C-091.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { cmsBnBD, cmsEn, siteMessages } from '@hms/i18n';
import '../../globals.css';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'en' ? cmsEn.title : cmsBnBD.title,
    robots: { index: false, follow: false },
  };
}
export default async function CmsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: prefix } = await params;
  if (prefix !== 'bn' && prefix !== 'en') notFound();
  const locale = prefix === 'bn' ? 'bn-BD' : 'en';
  setRequestLocale(locale);
  return (
    <html lang={locale}>
      <body className="font-ui">
        <NextIntlClientProvider
          locale={locale}
          messages={siteMessages[locale]}
          timeZone="Asia/Dhaka"
        >
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
