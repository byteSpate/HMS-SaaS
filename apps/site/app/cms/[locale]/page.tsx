// CMS template and existing assets are fictional CareSpate content. T-CMS-03, -04, FR-CMS-019.
import { cmsSnapshotSchema } from '@hms/contracts';
import { notFound } from 'next/navigation';
import { CmsEditor } from '../../../src/cms/editor';
import { content } from '../../../src/content/load';
export default async function CmsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'bn' && locale !== 'en') notFound();
  const assets = [
    ...new Set(JSON.stringify(content).match(/\/images\/[a-z0-9-]+\.(?:webp|jpg|png)/g) ?? []),
  ];
  const seed = cmsSnapshotSchema.parse({ site: content.site, pages: Object.values(content.pages) });
  return <CmsEditor seed={seed} assets={assets} initialLocale={locale === 'bn' ? 'bn-BD' : 'en'} />;
}
