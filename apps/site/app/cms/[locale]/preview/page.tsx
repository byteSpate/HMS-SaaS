// Browser-only preview of saved or published fictional demo content. T-CMS-DEMO-01, C-092.
import { notFound } from 'next/navigation';
import { CmsPreview } from '../../../../src/cms/preview';
export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'bn' && locale !== 'en') notFound();
  return (
    <CmsPreview
      locale={locale === 'bn' ? 'bn-BD' : 'en'}
      published={(await searchParams).mode === 'published'}
    />
  );
}
