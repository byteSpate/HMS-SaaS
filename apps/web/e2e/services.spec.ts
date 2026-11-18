// The service catalogue and service prices in a real browser (T-ORD-01; FR-ORD-001, FR-ORD-007,
// FR-CFG-002; SP-03). The API is the contract-valid mock in support/mock-services.ts and
// support/mock-price-lists.ts; texts come from the catalogs.
import AxeBuilder from '@axe-core/playwright';
import { messages } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
// next dev compiles each screen on its first visit; CI runs the production build.
test.describe.configure({ timeout: 90_000 });

async function signIn(page: Page, world: MockWorld) {
  await page.goto('/staff/login');
  await page.getByLabel(bn.login.hospitalCodeLabel).fill('demo');
  await page.getByLabel(bn.login.usernameLabel).fill(world.username);
  await page
    .getByRole('textbox', { name: bn.login.passwordLabel, exact: true })
    .fill(world.password);
  await page.getByRole('button', { name: bn.login.submit }).click();
  await expect(page).toHaveURL(/\/staff$/);
}

async function open(page: Page, link: string, heading: string) {
  await page.getByRole('link', { name: link }).first().click();
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({
    timeout: 20_000,
  });
}

test('adds a service with an upper-case code; a code in use is refused on the code', async ({
  page,
}) => {
  const world = newWorld({ permissions: ['admin.price.publish'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await open(page, bn.nav.services, bn.services.title);
  await expect(page.getByText('Complete blood count')).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: bn.services.add }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.services.code).fill('lft');
  await expect(dialog.getByLabel(bn.services.code)).toHaveValue('LFT');
  await dialog.getByLabel(bn.services.nameEn).fill('Liver function test');
  await dialog.getByLabel(bn.services.reportHours).fill('12');
  await dialog.getByLabel(bn.services.directlyOrderableLabel).check();
  await dialog.getByRole('button', { name: bn.services.add }).click();
  await expect(page.getByText(bn.services.added).first()).toBeVisible();
  const created = requests.find((r) => r.method === 'POST' && r.path === '/billing/services');
  expect(created?.body).toMatchObject({
    code: 'LFT',
    category: 'LAB',
    reportHours: 12,
    directlyOrderable: true,
  });

  await page.getByRole('button', { name: bn.services.add }).click();
  const again = page.getByRole('dialog');
  await again.getByLabel(bn.services.code).fill('CBC');
  await again.getByLabel(bn.services.nameEn).fill('Another CBC');
  await again.getByRole('button', { name: bn.services.add }).click();
  await expect(again.getByText(bn.services.codeTaken)).toBeVisible();
});

test('sets a service price in the draft price list', async ({ page }) => {
  const world = newWorld({ permissions: ['admin.price.publish'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await open(page, bn.nav.doctorFees, bn.doctorFees.title);
  await page.getByRole('button', { name: bn.doctorFees.startDraft }).click();
  await page.getByRole('button', { name: bn.servicePrices.add }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(bn.servicePrices.service)
    .selectOption({ label: 'CBC - Complete blood count' });
  await dialog.getByLabel(bn.servicePrices.price).fill('450.00');
  await dialog.getByRole('button', { name: bn.servicePrices.save }).click();
  await expect(page.getByText(bn.servicePrices.saved).first()).toBeVisible();
  const set = requests.find((r) => r.method === 'PUT' && r.path.includes('/service-prices/'));
  expect(set?.body).toMatchObject({ unitPrice: '450.00' });
  await expect(page.getByRole('cell', { name: /Complete blood count/ }).first()).toBeVisible();
});
