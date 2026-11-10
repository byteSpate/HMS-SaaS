// Schedule sessions in a real browser (T-SCH-01; FR-SCH-002; C-035; SP-03). The API is the
// contract-valid mock in support/mock-schedule-sessions.ts; texts come from the catalogs.
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

async function openSchedules(page: Page) {
  await page.getByRole('link', { name: bn.nav.schedules }).first().click();
  await expect(page.getByRole('heading', { name: bn.schedules.title })).toBeVisible({
    timeout: 20_000,
  });
}

/** Fills the add dialog for Karim Uddin, 17:00 to 21:00 today, and saves it. */
async function addEvening(page: Page, times = { start: '17:00', end: '21:00' }) {
  await page.getByRole('button', { name: bn.schedules.add }).click();
  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: bn.schedules.add });
  await expect(save).toBeDisabled();
  // The specialty tells apart doctors who share a name (FR-PRA-001).
  await dialog
    .getByLabel(bn.schedules.practitioner)
    .selectOption({ label: 'Karim Uddin, Medicine' });
  await dialog.getByLabel(bn.schedules.startTime).fill(times.start);
  await dialog.getByLabel(bn.schedules.endTime).fill(times.end);
  await dialog.getByLabel(bn.schedules.capacity).fill('20');
  await save.click();
  return dialog;
}

test('adds a session as a draft and publishes it', async ({ page }) => {
  const world = newWorld({ permissions: ['scheduling.schedule.manage'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await openSchedules(page);
  await expect(page.getByText(bn.schedules.empty)).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await addEvening(page);
  await expect(page.getByText(bn.schedules.added).first()).toBeVisible();
  const row = page.getByRole('row', { name: /Karim Uddin/ });
  await expect(row.getByText(bn.schedules.statusDRAFT)).toBeVisible();
  const created = requests.find((r) => r.method === 'POST' && r.path === '/schedule-sessions');
  expect(created?.csrf).toBeTruthy();
  expect(created?.idempotencyKey).toBeTruthy();
  expect(created?.body).toMatchObject({ startTime: '17:00', endTime: '21:00', capacity: 20 });

  await row.getByRole('button', { name: new RegExp(bn.schedules.publish) }).click();
  await expect(row.getByText(bn.schedules.statusPUBLISHED)).toBeVisible();
  const published = requests.find((r) => r.path.endsWith('/publish'));
  expect(published?.body).toEqual({ expectedVersion: 1 });
});

test("shows the API's refusal of an overlapping session on the start time", async ({ page }) => {
  const world = newWorld({ permissions: ['scheduling.schedule.manage'] });
  await installMockApi(page, world);
  await signIn(page, world);
  await openSchedules(page);
  await addEvening(page);
  await expect(page.getByRole('dialog')).toBeHidden();

  const dialog = await addEvening(page, { start: '20:00', end: '22:00' });
  await expect(dialog.getByText(bn.schedules.problem.startTime)).toBeVisible();
});

test('cancels a session after confirming', async ({ page }) => {
  const world = newWorld({ permissions: ['scheduling.schedule.manage'] });
  await installMockApi(page, world);
  await signIn(page, world);
  await openSchedules(page);
  await addEvening(page);
  const row = page.getByRole('row', { name: /Karim Uddin/ });
  await row.getByRole('button', { name: new RegExp(bn.schedules.cancel) }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(bn.schedules.cancelBody)).toBeVisible();
  await confirm.getByRole('button', { name: bn.schedules.cancelConfirm }).click();
  await expect(row.getByText(bn.schedules.statusCANCELLED)).toBeVisible();
});

test('a user without scheduling.schedule.manage does not see the menu entry', async ({ page }) => {
  const world = newWorld({ permissions: ['patient.record.search'] });
  await installMockApi(page, world);
  await signIn(page, world);
  await expect(page.getByRole('link', { name: bn.nav.schedules })).toHaveCount(0);
});
