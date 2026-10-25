// Typed CMS messages reuse the shared bilingual catalogs. T-CMS-03, C-062.
import { cmsBnBD, cmsEn, type Locale } from '@hms/i18n';
export type CmsMessages = typeof cmsEn | typeof cmsBnBD;
export function cmsMessages(locale: Locale): CmsMessages {
  return locale === 'en' ? cmsEn : cmsBnBD;
}
