// Top bar: emergency and hotline numbers (inside and outside Dhaka) one tap away on every page,
// email, secondary links and the language switch (FR-WEB-GEN-005, FR-WEB-GEN-010, X30).
// On phones it shows only the emergency call and the language switch (F section 3).
// Implements: T-WEB-05, T-WEB-17.
import type { Site } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { localize } from '../content';
import { Container } from './container';
import { LanguageLinks } from './language-links';
import { SiteLink } from './site-link';

export function TopBar({ site, locale }: { site: Site; locale: Locale }) {
  const t = useTranslations();
  const { contacts } = site.settings;
  return (
    <div role="region" aria-label={t('shell.quickContact')} className="bg-heading text-on-primary">
      <Container className="flex min-h-10 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-1 font-ui text-sm">
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <li>
            <a
              href={`tel:${contacts.emergency.tel}`}
              className="inline-flex min-h-8 items-center gap-2 rounded-control bg-danger px-2 font-semibold text-on-danger"
              data-testid="emergency-call"
            >
              <Icon name="siren" size={16} />
              {t('shell.emergency')} {contacts.emergency.display}
            </a>
          </li>
          <li className="hidden md:block">
            <a
              href={`tel:${contacts.hotline.tel}`}
              className="inline-flex items-center gap-2 hover:underline"
              data-testid="hotline-call"
            >
              <Icon name="phone" size={16} />
              {t('shell.hotline')} {contacts.hotline.display}
            </a>
          </li>
          <li className="hidden lg:block">
            <a
              href={`tel:${contacts.hotlineOutsideDhaka.tel}`}
              className="inline-flex items-center gap-2 hover:underline"
            >
              <Icon name="phone" size={16} />
              {t('shell.outsideDhaka')} {contacts.hotlineOutsideDhaka.display}
            </a>
          </li>
          <li className="hidden 2xl:block">
            <a
              href={`mailto:${contacts.email}`}
              className="inline-flex items-center gap-2 hover:underline"
            >
              <Icon name="envelope" size={16} />
              <span className="sr-only">{t('shell.email')}</span>
              {contacts.email}
            </a>
          </li>
        </ul>
        <div className="flex items-center gap-4">
          <ul className="hidden items-center gap-4 lg:flex">
            {site.navigation.topBar.map((item) => (
              <li key={item.href}>
                <SiteLink href={item.href} className="hover:underline">
                  {localize(item.label, locale)}
                </SiteLink>
              </li>
            ))}
          </ul>
          <LanguageLinks />
        </div>
      </Container>
    </div>
  );
}
