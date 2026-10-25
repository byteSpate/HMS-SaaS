// Footer: hospital contacts, link columns from site settings, social links and the footer note
// ("Powered by Bytespate HMS"). Every part comes from `site.json`, so the CMS can change it
// (C-072). Implements: T-WEB-05, FR-WEB-GEN-007.
import type { Site } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { Icon, type IconName } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { localize } from '../content';
import { Container } from './container';
import { Logo } from './logo';
import { SiteLink } from './site-link';

const SOCIAL: Record<
  Site['settings']['socialLinks'][number]['network'],
  { icon: IconName; name: string }
> = {
  facebook: { icon: 'facebook', name: 'Facebook' },
  youtube: { icon: 'youtube', name: 'YouTube' },
  instagram: { icon: 'instagram', name: 'Instagram' },
  linkedin: { icon: 'linkedin', name: 'LinkedIn' },
  whatsapp: { icon: 'whatsapp', name: 'WhatsApp' },
};

export function SiteFooter({ site, locale }: { site: Site; locale: Locale }) {
  const t = useTranslations();
  const { contacts, socialLinks } = site.settings;
  const phones = [
    { label: t('shell.emergency'), phone: contacts.emergency },
    { label: t('shell.hotline'), phone: contacts.hotline },
    { label: t('shell.outsideDhaka'), phone: contacts.hotlineOutsideDhaka },
  ];

  return (
    <footer className="bg-heading pb-20 text-on-primary md:pb-0">
      <Container className="grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Logo
            src={site.theme.logo.src}
            name={localize(site.settings.hospitalName, locale)}
            inverse
          />
          <p className="max-w-sm text-sm opacity-90">{localize(site.settings.tagline, locale)}</p>
          <h2 className="font-heading text-base font-semibold text-on-primary">
            {t('shell.contactUs')}
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {phones.map(({ label, phone }) => (
              <li key={label}>
                <a
                  href={`tel:${phone.tel}`}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <Icon name="phone" size={16} />
                  {label}: {phone.display}
                </a>
              </li>
            ))}
            <li>
              <a
                href={`mailto:${contacts.email}`}
                className="inline-flex items-center gap-2 hover:underline"
              >
                <Icon name="envelope" size={16} />
                {contacts.email}
              </a>
            </li>
          </ul>
          {socialLinks.length > 0 ? (
            <div>
              <h2 className="mb-2 font-heading text-base font-semibold text-on-primary">
                {t('shell.followUs')}
              </h2>
              <ul className="flex gap-2">
                {socialLinks.map((link) => (
                  <li key={link.network}>
                    <SiteLink
                      href={link.url}
                      aria-label={SOCIAL[link.network].name}
                      className="inline-flex size-10 items-center justify-center rounded-control border border-on-primary/30 hover:bg-on-primary/10"
                    >
                      <Icon name={SOCIAL[link.network].icon} />
                    </SiteLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <nav aria-label={t('shell.footerNavigation')} className="contents">
          {site.footer.columns.map((column) => (
            <div key={column.title.en}>
              <h2 className="mb-3 font-heading text-base font-semibold text-on-primary">
                {localize(column.title, locale)}
              </h2>
              <ul className="flex flex-col text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <SiteLink
                      href={link.href}
                      className="block py-2 opacity-90 hover:underline hover:opacity-100"
                    >
                      {localize(link.label, locale)}
                    </SiteLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </Container>
      <div className="border-t border-on-primary/20">
        <Container className="py-4 text-sm opacity-90">
          {localize(site.footer.note, locale)}
        </Container>
      </div>
    </footer>
  );
}
