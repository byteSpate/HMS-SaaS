// The audit search screen in a real browser (T-PLT-02; FR-AUD-005; SCR-24). The API is the
// contract-valid mock; texts come from the catalogs.
import AxeBuilder from '@axe-core/playwright';
import { messages } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];

async function signIn(page: Page, world: MockWorld) {
  await page.goto('/staff/login');
  await page.getByLabel(bn.login.usernameLabel).fill(world.username);
  await page
    .getByRole('textbox', { name: bn.login.passwordLabel, exact: true })
    .fill(world.password);
  await page.getByRole('button', { name: bn.login.submit }).click();
}

test('someone with audit.view searches and pages the audit trail', async ({ page }) => {
  const world = newWorld({ permissions: ['audit.view'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);

  await page.getByRole('link', { name: bn.nav.audit }).click();
  await expect(page.getByRole('heading', { name: bn.admin.auditTitle, level: 1 })).toBeVisible();
  await expect(page.getByText('admin.user.created')).toBeVisible();

  await page.getByRole('button', { name: bn.admin.auditMore }).click();
  await expect(page.getByText('authz.access.denied')).toBeVisible();
  await expect(page.getByRole('button', { name: bn.admin.auditMore })).toHaveCount(0);

  await page.getByLabel(bn.admin.auditActor).fill('rahima');
  await page.getByRole('button', { name: bn.admin.auditSearch }).click();
  await expect(page.getByText(bn.admin.auditEmpty)).toBeVisible();
  expect(requests.some((request) => request.query?.includes('actor=rahima'))).toBe(true);

  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations).toEqual([]);
});

test('without audit.view there is no link to the audit trail', async ({ page }) => {
  const world = newWorld({ permissions: [] });
  await installMockApi(page, world);
  await signIn(page, world);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: bn.nav.audit })).toHaveCount(0);
});
