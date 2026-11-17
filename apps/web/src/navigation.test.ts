import { describe, expect, it } from 'vitest';
import {
  activeNavigationId,
  NAVIGATION,
  type NavDefinition,
  visibleNavigation,
} from './navigation';

const DEFINITIONS: NavDefinition[] = [
  { id: 'home', labelKey: 'nav.home', href: '/', icon: 'home' },
  {
    id: 'billing',
    labelKey: 'nav.home',
    href: '/billing',
    icon: 'home',
    requires: 'billing.invoice.view',
  },
  {
    id: 'billing-sessions',
    labelKey: 'nav.home',
    href: '/billing/sessions',
    icon: 'home',
    requires: 'billing.session.view',
  },
];

describe('visibleNavigation', () => {
  it('hides entries whose permission is not granted', () => {
    const visible = visibleNavigation(DEFINITIONS, new Set(['billing.invoice.view']));
    expect(visible.map((item) => item.id)).toEqual(['home', 'billing']);
  });

  it('shows only entries without a requirement when nothing is granted', () => {
    expect(visibleNavigation(DEFINITIONS, new Set()).map((item) => item.id)).toEqual(['home']);
  });
});

describe('activeNavigationId', () => {
  it('matches the home route only exactly', () => {
    expect(activeNavigationId(DEFINITIONS, '/')).toBe('home');
    expect(activeNavigationId(DEFINITIONS, '/unknown')).toBeUndefined();
  });

  it('picks the most specific matching route', () => {
    expect(activeNavigationId(DEFINITIONS, '/billing/sessions/42')).toBe('billing-sessions');
    expect(activeNavigationId(DEFINITIONS, '/billing/invoices')).toBe('billing');
  });
});

describe('NAVIGATION sections', () => {
  it('keeps the items of each section together, so each heading shows once', () => {
    const groups = NAVIGATION.map((item) => item.groupKey ?? 'none');
    const seen = new Set<string>();
    groups.forEach((group, index) => {
      if (group !== groups[index - 1]) {
        expect(seen.has(group)).toBe(false);
        seen.add(group);
      }
    });
  });

  it('puts Home first, above every section', () => {
    expect(NAVIGATION[0]?.id).toBe('home');
    expect(NAVIGATION[0]?.groupKey).toBeUndefined();
    expect(NAVIGATION.slice(1).every((item) => item.groupKey !== undefined)).toBe(true);
  });
});
