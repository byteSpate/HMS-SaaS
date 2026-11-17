'use client';
// Application shell: skip link, top bar, and role navigation that changes form by device tier.
// Implements: T-UI-02, ADR-022 sections 6 and 7, F section 2.1, FR-I18N-001, NFR-ACC-001.
//   desktop (xl, 1280 and up): 240 px sidebar, collapsible to the 72 px rail
//   tablet  (md, 768 to 1279): 72 px icon rail
//   phone   (below md):        top bar and a bottom tab bar, at most 5 items plus "More"
// All breakpoint behavior lives here, in CSS classes, so screens never write it (ADR-022 rule 9).
// Navigation items arrive already filtered by permission and already translated.
// Role Home v2 design: the sidebar is a teal band, and items that share a `group` sit under a
// small heading (Front office, Clinical, Finance, Administration). Headings show only in the
// expanded sidebar; the rail and the phone tabs keep the flat order.
import {
  type AnchorHTMLAttributes,
  type ComponentType,
  Fragment,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import { Icon, type IconName } from '../icons/Icon.js';
import { cx } from '../utils/cx.js';
import { Button, IconButton } from '../primitives/Button.js';
import { Menu } from '../primitives/Menu.js';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  /** Section heading the item sits under, already translated. Items of one group are adjacent. */
  group?: string;
}

/** What the shell needs from a link: Next's `Link` or a plain anchor both fit. */
export type ShellLinkProps = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'className' | 'title' | 'aria-current' | 'children'
> & { href: string };

const PlainLink: ComponentType<ShellLinkProps> = (props) => <a {...props} />;

export interface AppShellProps {
  /**
   * Tenant logo and name (ADR-022 section 12). Mark the name element with `data-brand-name`:
   * the shell hides it where only the logo fits (the rail, and the phone top bar).
   */
  brand: ReactNode;
  nav: readonly NavItem[];
  activeId: string;
  linkComponent?: ComponentType<ShellLinkProps>;
  /** Called when a phone "More" item is chosen (it is a menu, not a link). */
  onNavigate?: (href: string) => void;
  /** Search and other tools at the start of the top bar. */
  topBarStart?: ReactNode;
  /** Language switch and user menu. */
  topBarEnd: ReactNode;
  children: ReactNode;
  /** Texts, already translated. */
  navLabel: string;
  skipLabel: string;
  collapseLabel: string;
  expandLabel: string;
  moreLabel: string;
}

const PHONE_TAB_LIMIT = 5;
const COLLAPSE_KEY = 'hms.sidebar-collapsed';

function usePersistedCollapse(): readonly [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // A per-viewer convenience only: the shell works without storage (ADR-022).
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // storage blocked: keep the default
    }
  }, []);
  function update(next: boolean): void {
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      // storage blocked: the choice lasts for this page view only
    }
  }
  return [collapsed, update] as const;
}

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  Link: ComponentType<ShellLinkProps>;
}

function SidebarLink({ item, active, collapsed, Link }: NavLinkProps) {
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex h-11 items-center gap-3 rounded-control px-3 font-ui font-medium text-sidebar-text',
        'focus-visible:outline-sidebar-focus focus-visible:-outline-offset-2',
        active ? 'bg-sidebar-active' : 'hover:bg-sidebar-hover',
      )}
    >
      <Icon name={item.icon} className="shrink-0" />
      {/* Rail on tablet (and on a collapsed desktop): the label stays for screen readers. */}
      <span className={cx('truncate md:sr-only', collapsed ? 'xl:sr-only' : 'xl:not-sr-only')}>
        {item.label}
      </span>
    </Link>
  );
}

function PhoneTabs({
  nav,
  activeId,
  Link,
  navLabel,
  moreLabel,
  onNavigate,
}: Pick<AppShellProps, 'nav' | 'activeId' | 'navLabel' | 'moreLabel' | 'onNavigate'> & {
  Link: ComponentType<ShellLinkProps>;
}) {
  const overflow = nav.length > PHONE_TAB_LIMIT;
  const visible = overflow ? nav.slice(0, PHONE_TAB_LIMIT - 1) : nav;
  const hidden = overflow ? nav.slice(PHONE_TAB_LIMIT - 1) : [];
  const tabClass =
    'flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-ui font-medium';

  return (
    <nav
      aria-label={navLabel}
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {visible.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.id === activeId ? 'page' : undefined}
          className={cx(
            tabClass,
            'min-w-0 flex-1 px-1',
            item.id === activeId ? 'text-primary' : 'text-text-muted',
          )}
        >
          <Icon name={item.icon} />
          <span className="max-w-full truncate">{item.label}</span>
        </Link>
      ))}
      {hidden.length > 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Menu
            menuLabel={moreLabel}
            items={hidden.map((item) => ({
              id: item.id,
              label: item.label,
              onSelect: () => onNavigate?.(item.href),
            }))}
            trigger={(props) => (
              <Button
                variant="ghost"
                className={cx(tabClass, 'h-16 w-full rounded-none')}
                {...props}
              >
                <Icon name="more" />
                <span>{moreLabel}</span>
              </Button>
            )}
          />
        </div>
      ) : null}
    </nav>
  );
}

export function AppShell({
  brand,
  nav,
  activeId,
  linkComponent,
  onNavigate,
  topBarStart,
  topBarEnd,
  children,
  navLabel,
  skipLabel,
  collapseLabel,
  expandLabel,
  moreLabel,
}: AppShellProps) {
  const Link = linkComponent ?? PlainLink;
  const [collapsed, setCollapsed] = usePersistedCollapse();

  return (
    <div className="min-h-dvh bg-bg text-text md:flex">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-control bg-surface px-4 py-2 font-ui font-medium text-primary focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {skipLabel}
      </a>

      <aside
        className={cx(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-sidebar-border bg-sidebar-bg text-sidebar-text md:flex md:w-18',
          collapsed ? 'xl:w-18' : 'xl:w-60',
        )}
      >
        {/* The brand is themed for the white top bar; on the teal band every part of it takes
            the sidebar text color. */}
        <div
          className={cx(
            'flex h-14 items-center overflow-hidden border-b border-sidebar-border px-5 **:text-sidebar-text!',
            'md:[&_[data-brand-name]]:sr-only xl:px-3',
            collapsed ? 'xl:px-5' : 'xl:[&_[data-brand-name]]:not-sr-only',
          )}
        >
          {brand}
        </div>
        <nav aria-label={navLabel} className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {nav.map((item, index) => (
            <Fragment key={item.id}>
              {item.group && item.group !== nav[index - 1]?.group ? (
                <p
                  className={cx(
                    'hidden px-2 pt-3 pb-0.5 text-xs font-medium text-sidebar-muted',
                    collapsed ? null : 'xl:block',
                  )}
                >
                  {item.group}
                </p>
              ) : null}
              <SidebarLink
                item={item}
                active={item.id === activeId}
                collapsed={collapsed}
                Link={Link}
              />
            </Fragment>
          ))}
        </nav>
        <div className="hidden border-t border-sidebar-border p-2 xl:block">
          <IconButton
            icon={collapsed ? 'caret-right' : 'caret-left'}
            label={collapsed ? expandLabel : collapseLabel}
            aria-expanded={!collapsed}
            variant="ghost"
            // cx does not merge classes: `!` makes these win over the ghost variant's colors.
            className="text-sidebar-text! hover:bg-sidebar-hover! focus-visible:outline-sidebar-focus!"
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-2 md:flex-nowrap md:py-0">
          {/* Only the logo on a phone, so the controls fit on the brand's row. */}
          <div className="min-w-0 md:hidden [&_[data-brand-name]]:sr-only">{brand}</div>
          {/* On a phone the tools wrap to a full-width second row under the brand. */}
          {topBarStart ? (
            <div className="order-last flex min-w-0 basis-full items-center gap-2 md:order-none md:max-w-xl md:flex-1 md:basis-auto">
              {topBarStart}
            </div>
          ) : null}
          <div className="ms-auto flex items-center gap-2">{topBarEnd}</div>
        </header>
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-20 outline-none md:pb-0">
          {children}
        </main>
      </div>

      <PhoneTabs
        nav={nav}
        activeId={activeId}
        Link={Link}
        navLabel={navLabel}
        moreLabel={moreLabel}
        onNavigate={onNavigate}
      />
    </div>
  );
}
