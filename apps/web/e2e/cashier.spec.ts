// The cashier desk and session review in a real browser (T-BIL-03; FR-BIL-026; UC-BIL-04). The API
// is the contract-valid mock in support/mock-billing.ts; texts come from the catalogs. Names and
// amounts are synthetic.
import AxeBuilder from '@axe-core/playwright';
import { formatMoney, messages, toLocaleDigits } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
const digits = (text: string) => toLocaleDigits(text, 'bn-BD');
const money = (amount: string) => formatMoney(amount, 'bn-BD', { symbol: 'sign' });
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

const CASHIER = ['billing.cashier_session.manage'];
const FINANCE = ['billing.cashier_session.review'];

test('opens a session with a float and closes it with a cash shortfall', async ({ page }) => {
  const world = newWorld({ permissions: CASHIER });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await page.getByRole('link', { name: bn.nav.cashier }).first().click();
  await expect(page.getByText(bn.cashier.noSession)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: bn.cashier.openSession }).click();
  const openDialog = page.getByRole('dialog');
  // Typed with Bangla digits, as a Bangla keyboard does.
  await openDialog.getByLabel(bn.cashier.openingFloat).fill(digits('2000'));
  await openDialog.getByRole('button', { name: bn.cashier.openSubmit }).click();
  await expect(page.getByText(bn.cashier.opened).first()).toBeVisible();
  const opened = requests.find(
    (request) => request.method === 'POST' && request.path === '/billing/cashier-sessions',
  );
  expect(opened?.body).toEqual({ openingFloat: '2000.00' });
  expect(opened?.idempotencyKey).toBeTruthy();
  const cash = page.getByRole('row', { name: new RegExp(bn.cashier.methodCASH) });
  await expect(cash).toContainText(money('2000.00'));
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: bn.cashier.closeSession }).click();
  const closeDialog = page.getByRole('dialog');
  await closeDialog
    .getByLabel(`${bn.cashier.methodCASH} - ${bn.cashier.columnCounted}`)
    .fill('1980');
  await closeDialog.getByRole('button', { name: bn.cashier.closeSubmit }).click();
  await expect(closeDialog.getByText(bn.cashier.unbalanced)).toBeVisible();
  await expect(
    closeDialog.getByRole('row', { name: new RegExp(bn.cashier.methodCASH) }),
  ).toContainText(money('-20.00'));
  await closeDialog.getByRole('button', { name: bn.common.close }).first().click();
  await expect(page.getByText(bn.cashier.noSession)).toBeVisible();
});

test('finance accepts a session with a difference only with a note', async ({ page }) => {
  const world = newWorld({ permissions: FINANCE });
  const { billing, requests } = await installMockApi(page, world);
  billing.seedClosedSession('990.00');
  await signIn(page, world);
  await page.getByRole('link', { name: bn.nav.cashierSessions }).first().click();
  const row = page.getByRole('row', { name: /Rafiq Hasan/ });
  await expect(row).toContainText(bn.cashierSessions.withDifference, { timeout: 20_000 });

  await row.getByRole('button', { name: bn.cashierSessions.review }).click();
  const dialog = page.getByRole('dialog');
  const accept = dialog.getByRole('button', { name: bn.cashierSessions.accept });
  await expect(accept).toBeDisabled();
  await expect(dialog.getByText(bn.cashierSessions.noteRequired)).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await dialog.getByLabel(bn.cashierSessions.note).fill('Short 10.00; change given twice');
  await accept.click();
  await expect(page.getByText(bn.cashierSessions.reviewed).first()).toBeVisible();
  await expect(page.getByText(bn.cashierSessions.empty)).toBeVisible();
  const reviewed = requests.find((request) => request.path.endsWith('/review'));
  expect(reviewed?.body).toMatchObject({ note: 'Short 10.00; change given twice' });
});
