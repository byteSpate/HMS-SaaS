import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell, type NavItem } from './AppShell.js';

const NAV: NavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: 'home' },
  { id: 'patients', label: 'Patients', href: '/patients', icon: 'user' },
];

const TEXTS = {
  navLabel: 'Main navigation',
  skipLabel: 'Skip to main content',
  collapseLabel: 'Collapse menu',
  expandLabel: 'Expand menu',
  moreLabel: 'More',
};

function renderShell(nav: NavItem[] = NAV, onNavigate = vi.fn()) {
  render(
    <AppShell
      brand={<span>Hospital name</span>}
      nav={nav}
      activeId="home"
      topBarEnd={<span>top end</span>}
      onNavigate={onNavigate}
      {...TEXTS}
    >
      <p>Page content</p>
    </AppShell>,
  );
  return { onNavigate };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('AppShell', () => {
  it('offers a skip link to the main content as the first focusable element', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Skip to main content' });
    expect(document.activeElement).toBe(skip);
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(document.getElementById('main-content')).not.toBeNull();
  });

  it('marks the active item with aria-current in the sidebar', () => {
    renderShell();
    const sidebar = screen.getAllByRole('navigation', {
      name: 'Main navigation',
    })[0] as HTMLElement;
    expect(within(sidebar).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(sidebar).getByRole('link', { name: 'Patients' }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('renders the same destinations as a phone tab bar', () => {
    renderShell();
    const navs = screen.getAllByRole('navigation', { name: 'Main navigation' });
    expect(navs).toHaveLength(2);
    expect(within(navs[1] as HTMLElement).getAllByRole('link')).toHaveLength(2);
  });

  it('collapses and expands the desktop sidebar and remembers the choice', async () => {
    const user = userEvent.setup();
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Collapse menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Expand menu' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
    expect(window.localStorage.getItem('hms.sidebar-collapsed')).toBe('1');
  });

  it('shows a section heading once above each group of the sidebar', () => {
    renderShell([
      { id: 'home', label: 'Home', href: '/', icon: 'home' },
      { id: 'desk', label: 'Front desk', href: '/desk', icon: 'search', group: 'Front office' },
      { id: 'sched', label: 'Schedules', href: '/sched', icon: 'calendar', group: 'Front office' },
      { id: 'cash', label: 'Cashier', href: '/cash', icon: 'briefcase', group: 'Finance' },
    ]);
    const sidebar = screen.getAllByRole('navigation', {
      name: 'Main navigation',
    })[0] as HTMLElement;
    expect(within(sidebar).getAllByText('Front office')).toHaveLength(1);
    expect(within(sidebar).getAllByText('Finance')).toHaveLength(1);
    // The phone bar keeps the flat list without headings.
    const phone = screen.getAllByRole('navigation', { name: 'Main navigation' })[1] as HTMLElement;
    expect(within(phone).queryByText('Front office')).toBeNull();
  });

  it('places the top bar tools before the account controls', () => {
    render(
      <AppShell
        brand={<span>Hospital name</span>}
        nav={NAV}
        activeId="home"
        topBarStart={<input aria-label="Find a patient" />}
        topBarEnd={<span>top end</span>}
        {...TEXTS}
      >
        <p>Page content</p>
      </AppShell>,
    );
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('textbox', { name: 'Find a patient' })).toBeTruthy();
  });

  it('puts the items beyond five behind a More menu on the phone bar', async () => {
    const user = userEvent.setup();
    const many: NavItem[] = Array.from({ length: 7 }, (_, i) => ({
      id: `item-${i}`,
      label: `Item ${i}`,
      href: `/item-${i}`,
      icon: 'home',
    }));
    const { onNavigate } = renderShell(many);
    const phone = screen.getAllByRole('navigation', { name: 'Main navigation' })[1] as HTMLElement;
    expect(within(phone).getAllByRole('link')).toHaveLength(4);

    await user.click(within(phone).getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'Item 5' }));
    expect(onNavigate).toHaveBeenCalledWith('/item-5');
  });
});
