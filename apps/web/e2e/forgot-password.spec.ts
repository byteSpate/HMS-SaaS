// Showing a password and asking for a new one, in a real browser (T-ACC-05; C-093; FR-ACC-012).
// The API is the contract-valid mock; texts come from the catalogs.
import AxeBuilder from '@axe-core/playwright';
import { messages, toLocaleDigits } from '@hms/i18n';
import { expect, test } from '@playwright/test';
import { installMockApi, newWorld } from './support/mock-api';

const bn = messages['bn-BD'];
const ADMIN_PERMISSIONS = ['admin.user.manage', 'admin.role.manage'];

test('the eye button shows and hides the typed password', async ({ page }) => {
  await installMockApi(page, newWorld());
  await page.goto('/staff/login');
  const password = page.locator('input[name="password"]');
  await password.fill('my secret value');
  await expect(password).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: bn.common.showSecret }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('my secret value');

  await page.getByRole('button', { name: bn.common.hideSecret }).click();
  await expect(password).toHaveAttribute('type', 'password');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('showing the password does not submit the sign-in form', async ({ page }) => {
  const api = await installMockApi(page, newWorld());
  await page.goto('/staff/login');
  await page.getByRole('button', { name: bn.common.showSecret }).click();
  expect(api.requests.filter((request) => request.path === '/auth/login')).toEqual([]);
});

test('a person who forgot the password can send a request from the sign-in page', async ({
  page,
}) => {
  const api = await installMockApi(page, newWorld());
  await page.goto('/staff/login');
  await page.getByRole('link', { name: bn.login.forgotLink }).click();
  await expect(page).toHaveURL(/\/staff\/forgot-password$/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: bn.forgot.submit }).click();
  await expect(page.getByText(bn.validation.required)).toHaveCount(2);

  await page.getByLabel(bn.login.hospitalCodeLabel).fill('demo');
  await page.getByLabel(bn.login.usernameLabel).fill('karim');
  await page.getByRole('button', { name: bn.forgot.submit }).click();

  await expect(page.getByRole('heading', { name: bn.forgot.sentTitle })).toBeVisible();
  await expect(page.getByText(bn.forgot.sentBody)).toBeVisible();
  expect(api.requests.find((r) => r.path === '/auth/password-reset-requests')?.body).toEqual({
    hospitalCode: 'demo',
    username: 'karim',
  });

  await page.getByRole('link', { name: bn.forgot.back }).click();
  await expect(page).toHaveURL(/\/staff\/login$/);
});

test('the administrator sees who asked, with the reminder to confirm it was them', async ({
  page,
}) => {
  const world = newWorld({ permissions: ADMIN_PERMISSIONS });
  await installMockApi(page, world);
  await page.goto('/staff/login');
  await page.getByLabel(bn.login.hospitalCodeLabel).fill('demo');
  await page.getByLabel(bn.login.usernameLabel).fill(world.username);
  await page.locator('input[name="password"]').fill(world.password);
  await page.getByRole('button', { name: bn.login.submit }).click();
  await expect(page).toHaveURL(/\/staff$/);
  await page.getByRole('link', { name: bn.nav.users }).click();

  const row = page.getByRole('row', { name: /Karim Hossain/ });
  await expect(row.getByText(bn.admin.resetRequested)).toBeVisible();
  // The count follows the interface language (C-036), so one request is a Bangla digit here.
  const notice = bn.admin.resetPendingNotice.replace('{count}', toLocaleDigits('1', 'bn-BD'));
  await expect(page.getByRole('alert').filter({ hasText: notice })).toBeVisible();
});
