// Section registry: renders a page's sections in stored order with one component per section
// type, skipping hidden ones (P-036, FR-WEB-GEN-008, AT-WEB-008). Adding a section type means a
// schema in @hms/contracts, a component here and, later, an editor form (D section 11).
// Implements: T-WEB-06.
import type { Section, Site } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import {
  ArticleListSection,
  BranchCardsSection,
  CentreCardsSection,
  DepartmentGridSection,
  FeaturedDoctorsSection,
  PackageShowcaseSection,
} from './collection-sections';
import {
  AppointmentRequestSection,
  CallToActionSection,
  EmergencyBandSection,
  FaqSection,
  GallerySection,
  GuideSectionsSection,
  ImageTextSection,
  QuickActionsSection,
  RichTextSection,
  ServiceStripSection,
  StatsSection,
} from './content-sections';
import { getSite } from '../content';
import { HeroSection } from './hero';

function SectionView({ section, locale, site }: { section: Section; locale: Locale; site: Site }) {
  switch (section.type) {
    case 'hero':
      return <HeroSection section={section} locale={locale} site={site} />;
    case 'quickActions':
      return <QuickActionsSection section={section} locale={locale} />;
    case 'serviceStrip':
      return <ServiceStripSection section={section} locale={locale} />;
    case 'departmentGrid':
      return <DepartmentGridSection section={section} locale={locale} />;
    case 'centreCards':
      return <CentreCardsSection section={section} locale={locale} />;
    case 'featuredDoctors':
      return <FeaturedDoctorsSection section={section} locale={locale} />;
    case 'packageShowcase':
      return <PackageShowcaseSection section={section} locale={locale} />;
    case 'branchCards':
      return <BranchCardsSection section={section} locale={locale} />;
    case 'articleList':
      return <ArticleListSection section={section} locale={locale} />;
    case 'emergencyBand':
      return <EmergencyBandSection section={section} locale={locale} site={site} />;
    case 'richText':
      return <RichTextSection section={section} locale={locale} />;
    case 'imageText':
      return <ImageTextSection section={section} locale={locale} />;
    case 'callToAction':
      return <CallToActionSection section={section} locale={locale} />;
    case 'faq':
      return <FaqSection section={section} locale={locale} />;
    case 'stats':
      return <StatsSection section={section} locale={locale} />;
    case 'gallery':
      return <GallerySection section={section} locale={locale} />;
    case 'guideSections':
      return <GuideSectionsSection section={section} locale={locale} />;
    case 'appointmentRequest':
      return <AppointmentRequestSection section={section} locale={locale} />;
    default: {
      // Exhaustive: a new section type without a renderer fails typecheck here.
      const unknown: never = section;
      throw new Error(`No renderer for section ${JSON.stringify(unknown)}`);
    }
  }
}

export function SectionList({
  sections,
  locale,
  site = getSite(),
}: {
  sections: readonly Section[];
  locale: Locale;
  site?: Site;
}) {
  return (
    <>
      {sections
        .filter((section) => !section.hidden)
        .map((section) => (
          <div key={section.id} data-section={section.type} data-section-id={section.id}>
            <SectionView section={section} locale={locale} site={site} />
          </div>
        ))}
    </>
  );
}
