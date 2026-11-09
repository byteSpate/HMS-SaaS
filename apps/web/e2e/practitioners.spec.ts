// The practitioner master in a real browser (T-PRA-01; FR-PRA-001..003; AT-PRA-001; SP-03). The API
// is the contract-valid mock in support/mock-practitioners.ts; texts come from the catalogs.
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

async function openPractitioners(page: Page) {
  await page.getByRole('link', { name: bn.nav.practitioners }).first().click();
  await expect(page.getByRole('heading', { name: bn.practitioners.title })).toBeVisible({
    timeout: 20_000,
  });
}

test('AT-PRA-001: adds a second practitioner with the same name; the list shows both', async ({
  page,
}) => {
  const world = newWorld({ permissions: ['practitioner.manage'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await openPractitioners(page);
  await expect(page.getByText('Nasrin Akter')).toHaveCount(1);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: bn.practitioners.add }).click();
  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: bn.practitioners.add });
  // FR-PRA-001: nothing to save without a name.
  await expect(save).toBeDisabled();
  await dialog.getByLabel(bn.practitioners.nameEn).fill('Nasrin Akter');
  await dialog.getByLabel(bn.practitioners.specialty).fill('Gynaecology');
  await save.click();

  await expect(page.getByText(bn.practitioners.added)).toBeVisible();
  await expect(page.getByText('Nasrin Akter')).toHaveCount(2);
  await expect(page.getByText('Gynaecology')).toBeVisible();
  const created = requests.find((r) => r.method === 'POST' && r.path === '/practitioners');
  expect(created?.idempotencyKey).toBeTruthy();
  expect(created?.csrf).toBeTruthy();
  expect(created?.body).toMatchObject({ nameEn: 'Nasrin Akter', specialty: 'Gynaecology' });
});

test('deactivates a practitioner with the version the screen showed', async ({ page }) => {
  const world = newWorld({ permissions: ['practitioner.manage'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await openPractitioners(page);

  await page.getByRole('button', { name: `${bn.practitioners.edit}: Nasrin Akter` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.practitioners.activeLabel).uncheck();
  await dialog.getByRole('button', { name: bn.practitioners.save }).click();

  await expect(page.getByText(bn.practitioners.saved)).toBeVisible();
  await expect(page.getByText(bn.practitioners.statusInactive)).toBeVisible();
  const edit = requests.find((r) => r.method === 'PUT');
  expect(edit?.body).toMatchObject({ active: false, expectedVersion: 1, nameEn: 'Nasrin Akter' });
});

test('SP-03: someone else saved first, so the dialog offers to reload', async ({ page }) => {
  const world = newWorld({ permissions: ['practitioner.manage'] });
  const { practitioners } = await installMockApi(page, world);
  await signIn(page, world);
  await openPractitioners(page);

  practitioners.state.changedElsewhere = true;
  await page.getByRole('button', { name: `${bn.practitioners.edit}: Nasrin Akter` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.practitioners.specialty).fill('Neonatology');
  await dialog.getByRole('button', { name: bn.practitioners.save }).click();
  await expect(dialog.getByText(bn.practitioners.staleNotice)).toBeVisible();
  await expect(dialog.getByRole('button', { name: bn.practitioners.reload })).toBeVisible();
});

test('a user without practitioner.manage does not see the menu entry', async ({ page }) => {
  const world = newWorld({ permissions: ['patient.record.search'] });
  await installMockApi(page, world);
  await signIn(page, world);
  await expect(page.getByRole('link', { name: bn.nav.patients }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: bn.nav.practitioners })).toHaveCount(0);
});
