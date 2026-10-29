// Temporary passwords and hospital administration in a real browser (T-ACC-05; FR-ACC-007,
// FR-ACC-008; SCR-22). The API is the contract-valid mock; texts come from the catalogs.
import AxeBuilder from '@axe-core/playwright';
import { messages } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
const ADMIN_PERMISSIONS = ['admin.user.manage', 'admin.role.manage'];

async function signIn(page: Page, world: MockWorld) {
  await page.goto('/staff/login');
  await page.getByLabel(bn.login.usernameLabel).fill(world.username);
  await page.getByLabel(bn.login.passwordLabel).fill(world.password);
  await page.getByRole('button', { name: bn.login.submit }).click();
}

test('a temporary password must be replaced before the shell (FR-ACC-007)', async ({ page }) => {
  const world = newWorld({ mustChangePassword: true });
  await installMockApi(page, world);
  await signIn(page, world);

  await expect(page).toHaveURL(/\/staff\/change-password$/);
  await expect(page.getByText(bn.changePassword.forced)).toBeVisible();
  await page.getByLabel(bn.changePassword.current).fill(world.password);
  await page
    .getByRole('textbox', { name: bn.changePassword.next, exact: true })
    .fill('my own new password');
  await page.getByLabel(bn.changePassword.repeat).fill('my own new password');
  await page.getByRole('button', { name: bn.changePassword.submit }).click();

  await expect(page).toHaveURL(/\/staff$/);
});

test('the two new passwords must match', async ({ page }) => {
  const world = newWorld({ mustChangePassword: true });
  await installMockApi(page, world);
  await signIn(page, world);
  await page.getByLabel(bn.changePassword.current).fill(world.password);
  await page
    .getByRole('textbox', { name: bn.changePassword.next, exact: true })
    .fill('my own new password');
  await page.getByLabel(bn.changePassword.repeat).fill('something else entirely');
  await page.getByRole('button', { name: bn.changePassword.submit }).click();
  await expect(page.getByText(bn.changePassword.mismatch)).toBeVisible();
});

test('an administrator adds a user with a temporary password', async ({ page }) => {
  const world = newWorld({ permissions: ADMIN_PERMISSIONS });
  await installMockApi(page, world);
  await signIn(page, world);

  await page.getByRole('link', { name: bn.nav.users }).first().click();
  await expect(page.getByRole('heading', { name: bn.admin.usersTitle, level: 1 })).toBeVisible();
  const karim = page.getByRole('row', { name: /Karim Hossain/ });
  await expect(karim.getByRole('cell').nth(1)).toHaveText('CSH');
  await expect(
    karim.getByRole('button', { name: `${bn.admin.viewDetails}: Karim Hossain` }),
  ).toBeVisible();
  await expect(karim.getByRole('button', { name: bn.admin.manage })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: bn.admin.addUser }).click();
  await page.getByLabel(bn.admin.username).fill('selina');
  await page.getByLabel(bn.admin.displayName).fill('Selina Akter');
  await page.getByLabel(bn.admin.temporaryPasswordLabel).fill('temporary pass 1');
  await page.getByRole('checkbox', { name: /Cashier/ }).check();
  await page.getByRole('button', { name: bn.admin.create }).click();

  await expect(page.getByText('Selina Akter')).toBeVisible();
  await expect(page.getByText(bn.admin.mustChange)).toBeVisible();
});

test('an administrator views a user and removes them from the hospital', async ({ page }) => {
  const world = newWorld({ permissions: ADMIN_PERMISSIONS });
  await installMockApi(page, world);
  await signIn(page, world);
  await page.getByRole('link', { name: bn.nav.users }).first().click();
  const karim = page.getByRole('row', { name: /Karim Hossain/ });

  await karim.getByRole('button', { name: `${bn.admin.viewDetails}: Karim Hossain` }).click();
  const details = page.getByRole('dialog', { name: bn.admin.detailsTitle });
  await expect(details.getByText('karim').first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await details.getByRole('button', { name: bn.admin.manage }).click();
  const manage = page.getByRole('dialog', {
    name: bn.admin.manageTitle.replace('{name}', 'Karim Hossain'),
  });
  await expect(manage).toBeVisible();
  await manage.getByRole('button', { name: bn.common.close }).click();

  await karim.getByRole('button', { name: `${bn.admin.remove}: Karim Hossain` }).click();
  const confirm = page.getByRole('dialog');
  await confirm.getByRole('button', { name: bn.admin.removeConfirm }).click();
  await expect(confirm.getByText(bn.validation.required)).toBeVisible();
  await confirm.getByLabel(bn.admin.reason).fill('Left the hospital');
  await confirm.getByRole('button', { name: bn.admin.removeConfirm }).click();

  await expect(karim.getByText(bn.admin.membershipRevoked)).toBeVisible();
  await expect(
    karim.getByRole('button', { name: `${bn.admin.remove}: Karim Hossain` }),
  ).toBeDisabled();
});

test('an administrator creates a role from a template', async ({ page }) => {
  const world = newWorld({ permissions: ADMIN_PERMISSIONS });
  await installMockApi(page, world);
  await signIn(page, world);

  await page.getByRole('link', { name: bn.nav.roles }).first().click();
  await page.getByRole('link', { name: bn.admin.addRole }).click();
  await expect(page).toHaveURL(/\/staff\/admin\/roles\/new$/);
  await page.getByLabel(bn.admin.fromTemplate).selectOption('ADM');
  await page.getByLabel(bn.admin.roleCode).fill('DEPUTY_ADMIN');
  await page.getByRole('button', { name: bn.admin.create }).click();

  await expect(page).toHaveURL(/\/staff\/admin\/roles$/);
  await expect(page.getByText('DEPUTY_ADMIN')).toBeVisible();
});

test("an administrator edits a role's permissions on its own page", async ({ page }) => {
  const world = newWorld({ permissions: ADMIN_PERMISSIONS });
  await installMockApi(page, world);
  await signIn(page, world);

  await page.getByRole('link', { name: bn.nav.roles }).first().click();
  await page.getByRole('link', { name: `${bn.admin.editPermissions}: Cashier` }).click();
  await expect(page).toHaveURL(/\/staff\/admin\/roles\/[0-9a-f-]+$/);
  await expect(
    page.getByRole('heading', { name: bn.admin.rolePermissionsTitle, level: 1 }),
  ).toBeVisible();
  const save = page.getByRole('button', { name: bn.admin.savePermissions });
  await expect(save).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const scheduling = page.getByRole('region', { name: /scheduling/ });
  await scheduling.getByRole('button', { name: /scheduling/ }).click();
  await expect(scheduling.getByRole('checkbox', { checked: false })).toHaveCount(0);
  await save.click();

  await expect(page).toHaveURL(/\/staff\/admin\/roles$/);
  const cashier = page.getByRole('row', { name: /Cashier/ });
  await expect(cashier.getByRole('cell').nth(3)).not.toHaveText('1');
});

test('staff without administration permissions see no admin links', async ({ page }) => {
  const world = newWorld();
  await installMockApi(page, world);
  await signIn(page, world);
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole('link', { name: bn.nav.users })).toHaveCount(0);
});
