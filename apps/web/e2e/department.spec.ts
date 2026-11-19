// The department worklist and the payment gate in a real browser (T-ORD-02; FR-LAB-004,
// FR-BIL-003, FR-ORD-004; UC-BIL-02 "Gate"). The API is the contract-valid mock in
// support/mock-orders.ts; texts come from the catalogs. Names are synthetic.
import AxeBuilder from '@axe-core/playwright';
import { formatMoney, messages } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
const money = (amount: string) => formatMoney(amount, 'bn-BD', { symbol: 'sign' });
// next dev compiles each screen on its first visit; CI runs the production build.
test.describe.configure({ timeout: 90_000 });

const SALMA = {
  patientId: '0199e0f0-0000-7000-8000-000000000001',
  mrn: 'MRN-000123',
  nameEn: 'Salma Begum',
  nameBn: null,
};
const VISIT = '0199e0f0-0000-7000-8000-000000000501';

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

/** A lab technologist with CBC (LAB) and a chest X-ray (IMAGING) ordered for Salma, unpaid. */
async function openWorklist(page: Page) {
  const world = newWorld({ permissions: ['order.service.start'] });
  const api = await installMockApi(page, world);
  const ids = api.services.services.map((service) => service.serviceItemId);
  const seeded = api.orders.seedForPatient(VISIT, SALMA, {
    items: ids.map((serviceItemId) => ({ serviceItemId, priority: 'ROUTINE', clinicalNote: null })),
  });
  const placed = (seeded.body as { orders: { orderId: string }[] }).orders;
  await signIn(page, world);
  await page.getByRole('link', { name: bn.nav.department }).first().click();
  await expect(page.getByRole('heading', { name: bn.department.title, level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  return { api, placed };
}

const section = (page: Page, title: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: title }) });

test('FR-LAB-004: unpaid orders wait for payment with the amount due; paid ones can start', async ({
  page,
}) => {
  const { api, placed } = await openWorklist(page);
  const awaiting = section(page, bn.department.awaitingTitle);
  await expect(awaiting.getByRole('row', { name: /Complete blood count/ })).toContainText(
    money('450.00'),
  );
  await expect(section(page, bn.department.readyTitle)).toContainText(bn.department.readyEmpty);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  const cbc = placed[0];
  if (!cbc) throw new Error('No order');
  api.orders.pay(cbc.orderId);
  await page.getByRole('button', { name: bn.worklist.refresh }).click();
  const ready = section(page, bn.department.readyTitle);
  const start = ready.getByRole('button', { name: /Complete blood count/ });
  await expect(start).toBeVisible();
  await start.click();
  await expect(
    section(page, bn.department.inProgressTitle).getByRole('row', {
      name: /Complete blood count/,
    }),
  ).toBeVisible();
  // The unpaid X-ray stays where it was.
  await expect(awaiting.getByRole('row', { name: /Chest X-ray/ })).toBeVisible();
});

test('the category filter shows one department only', async ({ page }) => {
  await openWorklist(page);
  await page.getByLabel(bn.department.category).selectOption({ label: bn.services.categoryLAB });
  const awaiting = section(page, bn.department.awaitingTitle);
  await expect(awaiting.getByRole('row', { name: /Complete blood count/ })).toBeVisible();
  await expect(awaiting.getByRole('row', { name: /Chest X-ray/ })).toHaveCount(0);
});

test('without order.service.start the worklist is not in the menu', async ({ page }) => {
  const world = newWorld({ permissions: ['patient.record.search'] });
  await installMockApi(page, world);
  await signIn(page, world);
  await expect(page.getByRole('link', { name: bn.nav.department })).toHaveCount(0);
});
