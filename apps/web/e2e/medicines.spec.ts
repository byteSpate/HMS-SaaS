// The medicine catalogue and prescribing lists in a real browser (T-CLI-03; FR-CLI-004; Q-067
// interim; FR-I18N-006; SP-03). The API is the contract-valid mock in support/mock-medicines.ts;
// texts come from the catalogs.
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

test('adds a medicine; the same brand, strength and form is refused on the brand', async ({
  page,
}) => {
  const world = newWorld({ permissions: ['admin.config.publish'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await open(page, bn.nav.medicines, bn.medicines.title);
  await expect(page.getByText('Napa 500 mg')).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: bn.medicines.add }).click();
  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: bn.medicines.add });
  await expect(save).toBeDisabled();
  await dialog.getByLabel(bn.medicines.brandName, { exact: true }).fill('Seclo');
  await dialog.getByLabel(bn.medicines.genericName).fill('Omeprazole');
  await dialog.getByLabel(bn.medicines.strength).fill('20 mg');
  await dialog.getByLabel(bn.medicines.form).fill('Capsule');
  await save.click();
  await expect(page.getByText(bn.medicines.added).first()).toBeVisible();
  await expect(page.getByText('Seclo 20 mg')).toBeVisible();
  const created = requests.find((r) => r.method === 'POST' && r.path === '/admin/medicines');
  expect(created?.body).toMatchObject({ brandName: 'Seclo', strength: '20 mg', nameBn: null });

  await page.getByRole('button', { name: bn.medicines.add }).click();
  const again = page.getByRole('dialog');
  await again.getByLabel(bn.medicines.brandName, { exact: true }).fill('NAPA');
  await again.getByLabel(bn.medicines.genericName).fill('Paracetamol');
  await again.getByLabel(bn.medicines.strength).fill('500 mg');
  await again.getByLabel(bn.medicines.form).fill('tablet');
  await again.getByRole('button', { name: bn.medicines.add }).click();
  await expect(again.getByText(bn.medicines.duplicate)).toBeVisible();
});

test('deactivates a medicine with the version the screen showed', async ({ page }) => {
  const world = newWorld({ permissions: ['admin.config.publish'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await open(page, bn.nav.medicines, bn.medicines.title);

  await page.getByRole('button', { name: `${bn.medicines.edit}: Amoxil 500 mg` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.medicines.activeLabel).uncheck();
  await dialog.getByRole('button', { name: bn.medicines.save }).click();
  await expect(page.getByText(bn.medicines.saved).first()).toBeVisible();
  const edit = requests.find((r) => r.method === 'PUT' && r.path.startsWith('/admin/medicines/'));
  expect(edit?.body).toMatchObject({ active: false, expectedVersion: 1 });
});

test('adds a frequency with a Bangla label; a missing Bangla label is marked', async ({ page }) => {
  const world = newWorld({ permissions: ['admin.config.publish'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await open(page, bn.nav.prescribingLists, bn.prescribingTerms.title);
  await expect(page.getByText('Once daily')).toBeVisible();
  await expect(page.getByText(bn.prescribingTerms.missingBn).first()).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page
    .getByRole('button', {
      name: `${bn.prescribingTerms.add}: ${bn.prescribingTerms.kindFrequency}`,
    })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.prescribingTerms.labelEn).fill('Three times daily');
  await dialog.getByLabel(bn.prescribingTerms.labelBn).fill(bn.prescribingTerms.kindFrequency);
  await dialog.getByLabel(bn.prescribingTerms.sortOrder).fill('3');
  await dialog.getByRole('button', { name: bn.prescribingTerms.add }).click();
  await expect(page.getByText(bn.prescribingTerms.added).first()).toBeVisible();
  const created = requests.find(
    (r) => r.method === 'POST' && r.path === '/admin/prescribing-terms',
  );
  expect(created?.body).toMatchObject({
    kind: 'FREQUENCY',
    labelEn: 'Three times daily',
    sortOrder: 3,
  });
});

test('the catalogue menu entries need admin.config.publish', async ({ page }) => {
  const world = newWorld({ permissions: ['clinical.prescription.create'] });
  await installMockApi(page, world);
  await signIn(page, world);
  await expect(page.getByRole('link', { name: bn.nav.medicines })).toHaveCount(0);
  await expect(page.getByRole('link', { name: bn.nav.prescribingLists })).toHaveCount(0);
});
