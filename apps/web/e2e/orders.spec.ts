// Doctor orders on the consultation screen in a real browser (T-ORD-01; UC-CLI-01 step 3;
// FR-ORD-002, FR-ORD-004, FR-ORD-008). The API is the contract-valid mock in
// support/mock-orders.ts; texts come from the catalogs. Names are synthetic.
import AxeBuilder from '@axe-core/playwright';
import { messages, toLocaleDigits } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
// next dev compiles each screen on its first visit; CI runs the production build.
test.describe.configure({ timeout: 90_000 });

const DOCTOR = ['clinical.consultation.record', 'clinical.document.sign', 'order.service.create'];

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

async function openConsultation(page: Page, permissions = DOCTOR) {
  const world = newWorld({ permissions });
  const api = await installMockApi(page, world);
  await signIn(page, world);
  await page.getByRole('link', { name: bn.nav.worklist }).first().click();
  await expect(page.getByRole('button', { name: bn.worklist.openNext })).toBeFocused({
    timeout: 20_000,
  });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: bn.note.title })).toBeVisible();
  return api;
}

test('FR-ORD-008: types, adds with Enter, places the orders; they show as not paid', async ({
  page,
}) => {
  const { requests } = await openConsultation(page);
  const search = page.getByRole('combobox', { name: bn.orders.searchLabel });
  await search.fill('cbc');
  await expect(page.getByRole('option', { name: /CBC/ })).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  await page.getByRole('combobox', { name: bn.orders.searchLabel }).fill('xray');
  await page.getByRole('option', { name: /XRAY-CHEST/ }).click();
  await page
    .getByLabel(`${bn.orders.priority}: Chest X-ray`)
    .selectOption({ label: bn.orders.priorityURGENT });
  await page.getByLabel(`${bn.orders.note}: Chest X-ray`).fill('Cough for two weeks');
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  // The button names the count in the screen's digits (ICU plural in the catalog).
  await page.getByRole('button', { name: new RegExp(toLocaleDigits('2', 'bn-BD')) }).click();
  await expect(page.getByText(bn.orders.placed).first()).toBeVisible();
  await expect(page.getByText(bn.orders.paymentUNPAID)).toHaveCount(2);
  const placed = requests.find((r) => r.method === 'POST' && r.path.endsWith('/orders'));
  expect(placed?.idempotencyKey).toBeTruthy();
  expect(placed?.body).toMatchObject({
    items: [
      { priority: 'ROUTINE', clinicalNote: null },
      { priority: 'URGENT', clinicalNote: 'Cough for two weeks' },
    ],
  });
});

test('a doctor without order.service.create sees no orders', async ({ page }) => {
  await openConsultation(page, ['clinical.consultation.record', 'clinical.document.sign']);
  await expect(page.getByRole('heading', { name: bn.orders.title, exact: true })).toHaveCount(0);
});
