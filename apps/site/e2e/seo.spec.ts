// Search engine signals in a real browser. Implements: T-WEB-13 acceptance; AT-WEB-040,
// AT-WEB-041, FR-WEB-ROUTE-006.
import { expect, test } from '@playwright/test';

const PAGES = ['/en', '/en/doctors', '/en/doctors/farhana-rahman', '/en/packages', '/en/contact'];

test('each page has its own title and description, canonical and hreflang (AT-WEB-040)', async ({
  page,
}) => {
  const titles = new Set<string>();
  for (const path of PAGES) {
    await page.goto(path);
    const title = await page.title();
    expect(title, path).not.toBe('');
    titles.add(title);
    await expect(page.locator('meta[name="description"]'), path).toHaveAttribute('content', /.+/);
    await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute(
      'href',
      `https://healthcare.bytespate.com${path}`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="bn-BD"]'), path).toHaveCount(1);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]'), path).toHaveCount(1);
  }
  expect(titles.size).toBe(PAGES.length);
});

test('demo pages ask not to be indexed', async ({ page }) => {
  await page.goto('/bn');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('sitemap lists both languages; robots blocks indexing while demo (AT-WEB-041)', async ({
  request,
}) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('https://healthcare.bytespate.com/bn/doctors/farhana-rahman');
  expect(sitemap).toContain('https://healthcare.bytespate.com/en/doctors/farhana-rahman');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /');
  expect(robots).toContain('Sitemap: https://healthcare.bytespate.com/sitemap.xml');
});

test('old staff bookmarks redirect under /staff (FR-WEB-ROUTE-002)', async ({ request }) => {
  for (const [path, target] of [
    ['/login', '/staff/login'],
    ['/choose-hospital', '/staff'],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers()['location']).toBe(target);
  }
});

test('the site leaves /staff paths alone (FR-WEB-ROUTE-006)', async ({ request }) => {
  const response = await request.get('/staff/login', { maxRedirects: 0 });
  expect(response.headers()['location'] ?? '').not.toContain('/bn/staff');
});
