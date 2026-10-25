// Home hero: the page's h1, a supporting line, the doctor and department search, popular links
// and the hero pictures, a slideshow when the content lists more than one (F section 3,
// FR-WEB-HOME-*, C-085). Implements: T-WEB-06, T-WEB-15.
import type { ImageRef, SectionOf, Site } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { getDepartment, listDepartments, listDoctors, localize, normalizeQuery } from '../content';
import { Container } from '../components/container';
import { HeroSearch, type SearchSuggestion } from '../components/hero-search';
import { HeroSlides } from '../components/hero-slides';
import { ImageSlot } from '../components/image-slot';
import { SiteLink } from '../components/site-link';

function suggestionsFor(locale: Locale): SearchSuggestion[] {
  const departments = listDepartments().map((department) => ({
    kind: 'department' as const,
    label: localize(department.name, locale),
    detail: localize(department.summary, locale),
    href: `/departments/${department.slug}`,
    terms: normalizeQuery(
      [department.name, ...(department.keywords ?? [])]
        .flatMap((text) => [text.bn, text.en])
        .join(' '),
    ),
  }));
  const doctors = listDoctors().map((doctor) => {
    const department = getDepartment(doctor.department);
    return {
      kind: 'doctor' as const,
      label: localize(doctor.name, locale),
      detail: department ? localize(department.name, locale) : localize(doctor.title, locale),
      href: `/doctors/${doctor.slug}`,
      terms: normalizeQuery(
        [doctor.name, department?.name, ...doctor.interests]
          .flatMap((text) => (text ? [text.bn, text.en] : []))
          .join(' '),
      ),
    };
  });
  return [...departments, ...doctors];
}

export function HeroSection({
  section,
  locale,
  site,
}: {
  section: SectionOf<'hero'>;
  locale: Locale;
  site: Site;
}) {
  const t = useTranslations();
  const { props } = section;
  const { emergency } = site.settings.contacts;
  const picture = (image: ImageRef, first: boolean) => (
    <ImageSlot
      image={image}
      locale={locale}
      ratio="card"
      icon="stethoscope"
      priority={first}
      sizes="(min-width: 1024px) 50vw, 100vw"
      className="h-full"
    />
  );
  return (
    <section className="bg-linear-to-b from-primary-soft to-bg">
      <Container className="grid items-center gap-10 py-12 lg:grid-cols-2 lg:py-20">
        <div className="enter-stagger flex flex-col gap-6">
          <h1 className="text-4xl font-semibold text-balance sm:text-5xl">
            {localize(props.heading, locale)}
          </h1>
          <p className="max-w-xl text-lg text-text-muted">{localize(props.text, locale)}</p>
          {props.search ? <HeroSearch suggestions={suggestionsFor(locale)} /> : null}
          {props.popularLinks.length > 0 ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-text-muted">{t('search.popular')}:</span>
              {props.popularLinks.map((link) => (
                <SiteLink
                  key={link.href}
                  href={link.href}
                  className="rounded-pill border border-border-strong bg-surface px-3 py-1 transition-colors duration-200 hover:border-primary hover:bg-primary-soft hover:text-primary"
                >
                  {localize(link.label, locale)}
                </SiteLink>
              ))}
            </p>
          ) : null}
          <a
            href={`tel:${emergency.tel}`}
            className="inline-flex w-fit items-center gap-2 font-ui font-semibold text-danger underline-offset-4 hover:underline"
            data-testid="hero-emergency"
          >
            <span className="ping">
              <Icon name="siren" size={18} />
            </span>
            {t('hero.emergencyLine', { number: emergency.display })}
          </a>
        </div>
        <div className="enter-unveil hidden lg:block">
          <HeroSlides
            locale={locale}
            slides={[
              { media: picture(props.image, true) },
              ...(props.slides ?? []).map((slide) => ({
                media: picture(slide.image, false),
                link: { label: localize(slide.link.label, locale), href: slide.link.href },
              })),
            ]}
          />
        </div>
      </Container>
    </section>
  );
}
