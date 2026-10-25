// Content sections an editor composes pages from: quick actions, services strip, emergency band,
// rich text, image with text, call to action, FAQ, stats, gallery, the patient guide and the
// call-back request. Text is rendered as text, never as HTML (C-080).
// Implements: T-WEB-06, T-WEB-12, T-WEB-15 (services strip, C-085).
import type { LocalizedRichText, LocalizedText, SectionOf, Site } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { buttonClassName, Icon, isIconName } from '@hms/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { listDepartments, listGuide, localize, localizeRich } from '../content';
import { AppointmentRequestForm } from '../components/appointment-request-form';
import { Container } from '../components/container';
import { CountUp } from '../components/count-up';
import { ImageSlot } from '../components/image-slot';
import { SectionHeading } from '../components/section-heading';
import { ServiceStrip } from '../components/service-strip';
import { SiteLink } from '../components/site-link';

interface Base {
  locale: Locale;
}

function Paragraphs({ text, locale }: { text: LocalizedRichText; locale: Locale }) {
  return (
    <div className="flex flex-col gap-4 text-lg leading-relaxed text-text">
      {localizeRich(text, locale).map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
}

function Band({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`py-12 sm:py-16 ${className ?? ''}`}>
      <Container>{children}</Container>
    </section>
  );
}

const optional = (text: LocalizedText | undefined, locale: Locale) =>
  text ? localize(text, locale) : undefined;

// Emergency is the one quick action in the danger color, always with its word (F section 5).
const EMERGENCY_HREF = '/emergency';

export function ServiceStripSection({
  section,
  locale,
}: Base & { section: SectionOf<'serviceStrip'> }) {
  return (
    <ServiceStrip
      label={localize(section.props.label, locale)}
      items={section.props.items.map((item) => ({
        icon: isIconName(item.icon) ? item.icon : 'check',
        label: localize(item.label, locale),
      }))}
    />
  );
}

export function QuickActionsSection({
  section,
  locale,
}: Base & { section: SectionOf<'quickActions'> }) {
  return (
    <section className="relative z-10 -mt-6">
      <Container>
        <ul className="enter-rise grid grid-cols-2 gap-3 rounded-panel border border-border bg-surface p-3 shadow-overlay sm:grid-cols-3 lg:grid-cols-6">
          {section.props.items.map((item) => (
            <li key={item.href}>
              <SiteLink
                href={item.href}
                className={`group flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-control p-3 text-center font-ui text-sm font-medium transition-colors duration-200 ${
                  item.href === EMERGENCY_HREF
                    ? 'text-danger hover:bg-status-problem-bg'
                    : 'hover:bg-primary-soft hover:text-primary'
                }`}
              >
                <Icon
                  name={isIconName(item.icon) ? item.icon : 'arrow-right'}
                  size={28}
                  className={`transition-transform duration-300 ease-(--ease-out) group-hover:-translate-y-1 ${
                    item.href === EMERGENCY_HREF ? 'text-danger' : 'text-primary'
                  }`}
                />
                {localize(item.label, locale)}
              </SiteLink>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export function EmergencyBandSection({
  section,
  locale,
  site,
}: Base & { section: SectionOf<'emergencyBand'>; site: Site }) {
  const t = useTranslations();
  const { contacts } = site.settings;
  return (
    <section className="bg-heading text-on-primary">
      <Container className="grid items-center gap-8 py-12 md:grid-cols-[2fr_1fr]">
        <div className="reveal flex flex-col gap-4">
          <h2 className="text-3xl font-semibold text-on-primary">
            {localize(section.props.heading, locale)}
          </h2>
          <p className="text-lg opacity-90">{localize(section.props.text, locale)}</p>
          <div className="flex flex-wrap gap-3">
            <a href={`tel:${contacts.emergency.tel}`} className={buttonClassName('danger', 'lg')}>
              <span className="ping">
                <Icon name="phone" size={20} />
              </span>
              {t('common.callEmergency')} {contacts.emergency.display}
            </a>
            <a
              href={`tel:${contacts.ambulance.tel}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-control border border-on-primary px-5 font-ui font-medium text-on-primary hover:bg-on-primary/10"
            >
              <Icon name="ambulance" size={20} />
              {t('common.callAmbulance')} {contacts.ambulance.display}
            </a>
          </div>
        </div>
        <div className="reveal hidden md:block">
          <ImageSlot
            image={section.props.image}
            locale={locale}
            ratio="card"
            icon="ambulance"
            tone="dark"
            className="rounded-panel"
          />
        </div>
      </Container>
    </section>
  );
}

export function RichTextSection({ section, locale }: Base & { section: SectionOf<'richText'> }) {
  return (
    <Band>
      <div className="reveal max-w-3xl">
        {section.props.heading ? (
          <h2 className="mb-6 text-2xl font-semibold sm:text-3xl">
            {localize(section.props.heading, locale)}
          </h2>
        ) : null}
        <Paragraphs text={section.props.body} locale={locale} />
      </div>
    </Band>
  );
}

export function ImageTextSection({ section, locale }: Base & { section: SectionOf<'imageText'> }) {
  const { props } = section;
  return (
    <Band className="bg-surface">
      <div className="grid items-center gap-10 md:grid-cols-2">
        <ImageSlot
          image={props.image}
          locale={locale}
          className={`reveal rounded-panel ${props.imageSide === 'end' ? 'md:order-last' : ''}`}
        />
        <div className="reveal flex flex-col gap-6">
          <h2 className="text-2xl font-semibold sm:text-3xl">{localize(props.heading, locale)}</h2>
          <Paragraphs text={props.body} locale={locale} />
          {props.link ? (
            <SiteLink href={props.link.href} className={buttonClassName('primary', 'lg', 'w-fit')}>
              {localize(props.link.label, locale)}
            </SiteLink>
          ) : null}
        </div>
      </div>
    </Band>
  );
}

export function CallToActionSection({
  section,
  locale,
}: Base & { section: SectionOf<'callToAction'> }) {
  const { props } = section;
  return (
    <Band>
      <div className="reveal flex flex-col items-start justify-between gap-6 rounded-panel bg-primary-soft p-8 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-semibold">{localize(props.heading, locale)}</h2>
          <p className="mt-2 text-text-muted">{localize(props.text, locale)}</p>
        </div>
        <SiteLink href={props.button.href} className={buttonClassName('primary', 'lg')}>
          {localize(props.button.label, locale)}
        </SiteLink>
      </div>
    </Band>
  );
}

export function FaqSection({ section, locale }: Base & { section: SectionOf<'faq'> }) {
  return (
    <Band>
      <SectionHeading heading={localize(section.props.heading, locale)} />
      <ul className="reveal-list flex max-w-3xl flex-col gap-3">
        {section.props.items.map((item) => (
          <li key={item.question.en}>
            <details className="disclosure group rounded-panel border border-border bg-surface transition-colors duration-200 open:border-primary">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-medium [&::-webkit-details-marker]:hidden">
                {localize(item.question, locale)}
                <Icon
                  name="plus"
                  size={18}
                  className="shrink-0 text-primary transition-transform duration-300 ease-(--ease-out) group-open:rotate-45"
                />
              </summary>
              <div className="px-5 pb-5 text-text-muted">
                {localizeRich(item.answer, locale).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Band>
  );
}

export function StatsSection({ section, locale }: Base & { section: SectionOf<'stats'> }) {
  return (
    <Band>
      {section.props.heading ? (
        <SectionHeading heading={localize(section.props.heading, locale)} />
      ) : null}
      <dl className="reveal-list grid grid-cols-2 gap-6 md:grid-cols-4">
        {section.props.items.map((item) => (
          <div key={item.label.en} className="rounded-panel border border-border bg-surface p-6">
            <dt className="text-sm text-text-muted">{localize(item.label, locale)}</dt>
            <dd className="font-heading text-3xl font-semibold text-heading">
              <CountUp value={item.value} locale={locale} />
            </dd>
          </div>
        ))}
      </dl>
    </Band>
  );
}

export function GallerySection({ section, locale }: Base & { section: SectionOf<'gallery'> }) {
  return (
    <Band>
      <SectionHeading heading={localize(section.props.heading, locale)} />
      <ul className="reveal-list grid grid-cols-2 gap-4 md:grid-cols-3">
        {section.props.images.map((image) => (
          <li key={image.slot}>
            <ImageSlot image={image} locale={locale} className="rounded-panel" />
          </li>
        ))}
      </ul>
    </Band>
  );
}

/** The patient and visitor guide; each part has a stable anchor for deep links (AT-WEB-057). */
export function GuideSectionsSection({
  section,
  locale,
}: Base & { section: SectionOf<'guideSections'> }) {
  const t = useTranslations();
  const guide = listGuide();
  return (
    <Band>
      {section.props.heading ? (
        <SectionHeading heading={localize(section.props.heading, locale)} />
      ) : null}
      <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
        <nav aria-labelledby="guide-contents" className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="guide-contents" className="sr-only">
            {t('common.contents')}
          </h2>
          <ul className="flex flex-col gap-1 border-s border-border">
            {guide.map((part) => (
              <li key={part.id}>
                <a href={`#${part.id}`} className="block px-4 py-2 text-sm hover:text-primary">
                  {localize(part.title, locale)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-10">
          {guide.map((part) => (
            <section
              key={part.id}
              id={part.id}
              aria-labelledby={`${part.id}-title`}
              className="scroll-mt-28"
            >
              <h2 id={`${part.id}-title`} className="mb-4 text-2xl font-semibold">
                {localize(part.title, locale)}
              </h2>
              <Paragraphs text={part.body} locale={locale} />
            </section>
          ))}
        </div>
      </div>
    </Band>
  );
}

export function AppointmentRequestSection({
  section,
  locale,
}: Base & { section: SectionOf<'appointmentRequest'> }) {
  const departments = listDepartments().map((department) => ({
    value: department.slug,
    label: localize(department.name, locale),
  }));
  return (
    <Band>
      <div className="max-w-3xl rounded-panel border border-border bg-surface p-6 sm:p-8">
        <SectionHeading
          heading={localize(section.props.heading, locale)}
          text={optional(section.props.text, locale)}
        />
        <AppointmentRequestForm departments={departments} department={section.props.department} />
      </div>
    </Band>
  );
}
