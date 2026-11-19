// Reception's direct diagnostic orders and order cancellation in a real browser (T-VIS-02,
// T-ORD-03; UC-VIS-02 diagnostic path; UC-ORD-02; FR-ORD-001, FR-ORD-006). The API is the
// contract-valid mock in support/mock-orders.ts; texts come from the catalogs.
import AxeBuilder from '@axe-core/playwright';
import { messages, toLocaleDigits } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
const KARIM = '0199e0b0-0000-7000-8000-000000000001';
// next dev compiles each screen on its first visit; CI runs the production build.
test.describe.configure({ timeout: 90_000 });

const RECEPTION = [
  'patient.record.search',
  'visit.create',
  'order.direct_diagnostic.create',
  'order.service.cancel',
];

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

/** "Place 1 order": the count in Bangla digits names the button (ICU plural in the catalog). */
const placeButton = (page: Page) =>
  page.getByRole('button', { name: new RegExp(toLocaleDigits('1', 'bn-BD')) });

async function openPatient(page: Page, permissions = RECEPTION) {
  const world = newWorld({ permissions });
  const api = await installMockApi(page, world);
  await signIn(page, world);
  await page.goto(`/staff/patients/${KARIM}`);
  return api;
}

test('UC-VIS-02: reception orders a direct test; the doctor-only X-ray is not offered', async ({
  page,
}) => {
  const { requests } = await openPatient(page);
  await expect(page.getByRole('heading', { name: bn.orders.directTitle })).toBeVisible({
    timeout: 20_000,
  });
  const search = page.getByRole('combobox', { name: bn.orders.searchLabel });
  await search.fill('xray');
  await expect(page.getByText(bn.orders.searchEmptyDirect)).toBeVisible();
  await search.fill('cbc');
  await page.getByRole('option', { name: /CBC/ }).click();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await placeButton(page).click();
  await expect(page.getByText(bn.orders.placed).first()).toBeVisible();
  await expect(page.getByText(bn.orders.paymentUNPAID)).toBeVisible();
  const created = requests.find((r) => r.method === 'POST' && r.path === '/visits/diagnostic');
  expect(created?.idempotencyKey).toBeTruthy();
  expect(created?.body).toMatchObject({ patientId: KARIM, items: [{ priority: 'ROUTINE' }] });
});

test('UC-ORD-02: cancels an unpaid order with a reason; it stays visible as cancelled', async ({
  page,
}) => {
  const { requests } = await openPatient(page);
  const search = page.getByRole('combobox', { name: bn.orders.searchLabel });
  await search.fill('cbc');
  await page.getByRole('option', { name: /CBC/ }).click();
  await placeButton(page).click();
  await expect(page.getByText(bn.orders.paymentUNPAID)).toBeVisible();

  await page.getByRole('button', { name: `${bn.orders.cancel}: Complete blood count` }).click();
  const dialog = page.getByRole('dialog');
  const submit = dialog.getByRole('button', { name: bn.orders.cancelSubmit });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel(bn.orders.cancelReason).fill('Ordered by mistake');
  await submit.click();
  await expect(page.getByText(bn.orders.cancelled).first()).toBeVisible();
  await expect(page.getByText(bn.orders.statusCANCELLED).first()).toBeVisible();
  const cancel = requests.find((r) => r.method === 'POST' && r.path.endsWith('/cancel'));
  expect(cancel?.body).toEqual({ reason: 'Ordered by mistake', expectedVersion: 1 });
});

test('without visit.create the direct orders section is hidden', async ({ page }) => {
  await openPatient(page, ['patient.record.search', 'order.direct_diagnostic.create']);
  await expect(page.getByRole('heading', { name: bn.orders.directTitle })).toHaveCount(0);
});
