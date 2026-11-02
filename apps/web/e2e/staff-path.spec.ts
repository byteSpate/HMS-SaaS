// The staff app lives under /staff and is never indexed (C-076, P-043, P-045), and sends the same
// enforced security headers as the public site (P-047). Implements: T-WEB-18, FR-WEB-ROUTE-002,
// FR-WEB-ROUTE-006, AT-WEB-065, AT-WEB-067 (header part).
import { messages } from '@hms/i18n';
import { expect, test } from '@playwright/test';
import { installMockApi, newWorld } from './support/mock-api';

test('staff screens are served under /staff with their assets', async ({ page }) => {
  await installMockApi(page, newWorld());
  const assets: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/_next/')) assets.push(new URL(request.url()).pathname);
  });
  await page.goto('/staff');
  await expect(page).toHaveURL('/staff/login');
  await expect(page.getByLabel(messages['bn-BD'].login.usernameLabel)).toBeVisible();
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.every((path) => path.startsWith('/staff/_next/'))).toBe(true);
});

test('the container health check answers under /staff without calling the API (T-FND-05)', async ({
  request,
}) => {
  const response = await request.get('/staff/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', service: 'web' });
});

test('staff responses are not indexed and carry the enforced security headers', async ({
  request,
}) => {
  const response = await request.get('/staff/login');
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toMatch(/connect-src 'self' http:\/\/localhost:4100/);
  expect(headers['content-security-policy-report-only']).toBeUndefined();
});
