// The department master in a real browser (T-PRA-02; FR-CFG-001, FR-I18N-006; SP-03). The API is
// the contract-valid mock in support/mock-departments.ts; texts come from the catalogs.
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

async function openDepartments(page: Page) {
  await page.getByRole('link', { name: bn.nav.departments }).first().click();
  await expect(page.getByRole('heading', { name: bn.departments.title })).toBeVisible({
    timeout: 20_000,
  });
}

test('adds a department with an upper-case code; a missing Bangla name is marked', async ({
  page,
}) => {
  const world = newWorld({ permissions: ['admin.config.publish'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await openDepartments(page);
  await expect(page.getByText('Medicine')).toBeVisible();
  // FR-I18N-006: the seeded department has no Bangla name, and the list says so.
  await expect(page.getByText(bn.departments.missingBn)).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: bn.departments.add }).click();
  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: bn.departments.add });
  await expect(save).toBeDisabled();
  await dialog.getByLabel(bn.departments.code).fill('obg');
  await expect(dialog.getByLabel(bn.departments.code)).toHaveValue('OBG');
  await dialog.getByLabel(bn.departments.nameEn).fill('Gynaecology');
  await save.click();

  // The toast text is also in the screen reader's live region.
  await expect(page.getByText(bn.departments.added).first()).toBeVisible();
  await expect(page.getByText('Gynaecology')).toBeVisible();
  const created = requests.find((r) => r.method === 'POST' && r.path === '/admin/departments');
  expect(created?.csrf).toBeTruthy();
  expect(created?.body).toMatchObject({ code: 'OBG', nameEn: 'Gynaecology', nameBn: null });
});

test('shows a code already in use on the code field', async ({ page }) => {
  const world = newWorld({ permissions: ['admin.config.publish'] });
  await installMockApi(page, world);
  await signIn(page, world);
  await openDepartments(page);

  await page.getByRole('button', { name: bn.departments.add }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.departments.code).fill('MED');
  await dialog.getByLabel(bn.departments.nameEn).fill('Medicine two');
  await dialog.getByRole('button', { name: bn.departments.add }).click();
  await expect(dialog.getByText(bn.departments.codeTaken)).toBeVisible();
});

test('deactivates a department with the version the screen showed', async ({ page }) => {
  const world = newWorld({ permissions: ['admin.config.publish'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await openDepartments(page);

  await page.getByRole('button', { name: `${bn.departments.edit}: MED` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.departments.activeLabel).uncheck();
  await dialog.getByRole('button', { name: bn.departments.save }).click();

  await expect(page.getByText(bn.departments.saved).first()).toBeVisible();
  await expect(page.getByText(bn.departments.statusInactive)).toBeVisible();
  const edit = requests.find((r) => r.method === 'PUT');
  expect(edit?.body).toMatchObject({ code: 'MED', active: false, expectedVersion: 1 });
});

test('SP-03: someone else saved first, so the dialog offers to reload', async ({ page }) => {
  const world = newWorld({ permissions: ['admin.config.publish'] });
  const { departments } = await installMockApi(page, world);
  await signIn(page, world);
  await openDepartments(page);

  departments.state.changedElsewhere = true;
  await page.getByRole('button', { name: `${bn.departments.edit}: MED` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.departments.nameEn).fill('Internal medicine');
  await dialog.getByRole('button', { name: bn.departments.save }).click();
  await expect(dialog.getByText(bn.departments.staleNotice)).toBeVisible();
  await expect(dialog.getByRole('button', { name: bn.departments.reload })).toBeVisible();
});

test('a user without admin.config.publish does not see the menu entry', async ({ page }) => {
  const world = newWorld({ permissions: ['practitioner.manage'] });
  await installMockApi(page, world);
  await signIn(page, world);
  await expect(page.getByRole('link', { name: bn.nav.practitioners }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: bn.nav.departments })).toHaveCount(0);
});
