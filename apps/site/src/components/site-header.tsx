// Sticky header: logo, main navigation with the departments dropdown, and the "Book appointment"
// call to action. The search button opens the header search bar (header-search.tsx). Below the
// extra-large breakpoint the links move into the mobile menu (F section 3). Implements: T-WEB-05, T-WEB-17, FR-WEB-NAV-*.
import type { Site } from '@hms/contracts';
import type { Locale } from '@hms/i18n';
import { buttonClassName } from '@hms/ui';
import { useTranslations } from 'next-intl';
import { localize } from '../content';
import { Link } from '../i18n/navigation';
import { Container } from './container';
import { HeaderSearch } from './header-search';
import { Logo } from './logo';
import { MobileMenu } from './mobile-menu';
import { NavDropdown } from './nav-dropdown';
import { toNavLinks } from './nav-types';

export function SiteHeader({ site, locale }: { site: Site; locale: Locale }) {
  const t = useTranslations();
  const items = toNavLinks(site.navigation.header, locale);
  const [cta] = toNavLinks([site.navigation.headerCta], locale);
  if (!cta) return null;

  return (
    <header className="header-elevate sticky top-0 z-30 border-b border-border bg-surface">
      <Container className="flex min-h-16 items-center justify-between gap-4 py-2">
        <Logo src={site.theme.logo.src} name={localize(site.settings.shortName, locale)} />
        <nav aria-label={t('shell.mainNavigation')} className="hidden xl:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.href}>
                {item.children ? (
                  <NavDropdown item={item} />
                ) : (
                  <Link
                    href={item.href}
                    className="flex min-h-10 items-center rounded-control px-3 font-ui text-sm font-medium text-text transition-colors duration-200 hover:bg-primary-soft hover:text-primary"
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <HeaderSearch />
          {/* The wrapper hides the call to action on phones, where the bottom bar offers it;
              a display class on the link itself would fight the button's inline-flex. */}
          <div className="hidden md:block">
            <Link href={cta.href} className={buttonClassName('primary', 'md')}>
              {cta.label}
            </Link>
          </div>
          <div className="xl:hidden">
            <MobileMenu items={items} cta={cta} />
          </div>
        </div>
      </Container>
    </header>
  );
}
