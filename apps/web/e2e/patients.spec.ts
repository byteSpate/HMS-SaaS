// The front desk in a real browser (T-PAT-01..04; SCR-02, SCR-03; FR-PAT-001, -003, -007, -008).
// The API is the contract-valid mock in support/mock-patients.ts; texts come from the catalogs.
import AxeBuilder from '@axe-core/playwright';
import { messages, toLocaleDigits } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
const KARIM = '0199e0b0-0000-7000-8000-000000000001';
// next dev compiles each screen on its first visit; CI runs the production build.
test.describe.configure({ timeout: 90_000 });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

test('finds a patient by phone in any spelling and opens the record', async ({ page }) => {
  const world = newWorld({ permissions: ['patient.record.search'] });
  await installMockApi(page, world);
  await signIn(page, world);

  await page.getByRole('link', { name: bn.nav.patients }).first().click();
  await expect(page.getByRole('button', { name: bn.patients.newRegistration })).toHaveCount(0);
  await page.getByRole('searchbox', { name: bn.patients.searchLabel }).fill('+880 1700-000001');
  await expect(page.getByText(bn.patients.matchedByPhone)).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('link', { name: 'Karim Ahmed' }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/patients/${KARIM}$`), { timeout: 20_000 });
  await expect(page.getByText('MRN-000001')).toBeVisible();
  // Without patient.sensitive.view and patient.identity.edit there is nothing to press.
  await expect(page.getByRole('button', { name: bn.patients.showNid })).toHaveCount(0);
  await expect(page.getByRole('button', { name: bn.patients.correct })).toHaveCount(0);
});

test('registering next to a possible duplicate needs an explicit confirmation', async ({
  page,
}) => {
  const world = newWorld({ permissions: ['patient.record.search', 'patient.record.register'] });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await page.getByRole('link', { name: bn.nav.patients }).first().click();
  await page.getByRole('button', { name: bn.patients.newRegistration }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: bn.patients.nameEn }).fill('Karim Uddin');
  await dialog.getByRole('combobox', { name: bn.patients.sex }).selectOption('MALE');
  await dialog.getByRole('textbox', { name: bn.patients.age }).fill('40');
  await dialog.getByRole('textbox', { name: bn.patients.phone }).fill('01700000001');

  await expect(dialog.getByText('Karim Ahmed')).toBeVisible();
  await expect(dialog.getByText(bn.patients.reasonSamePhone)).toBeVisible();
  const register = dialog.getByRole('button', { name: bn.patients.register });
  await expect(register).toBeDisabled();
  await dialog.getByRole('checkbox', { name: bn.patients.confirmNew }).check();
  await register.click();

  await expect(page).toHaveURL(/\/staff\/patients\/0199e0b0-0000-7000-8000-000000000002$/, {
    timeout: 20_000,
  });
  const registration = requests.find(
    (request) => request.method === 'POST' && request.path === '/patients',
  );
  expect(registration?.body).toMatchObject({
    nameEn: 'Karim Uddin',
    sex: 'MALE',
    reportedAgeYears: 40,
    phone: '01700000001',
    confirmNewDespiteCandidates: true,
    shownCandidateIds: [KARIM],
  });
  expect(registration?.idempotencyKey).toMatch(UUID);
});

test('shows the full NID only on request, and a stale correction asks to reload', async ({
  page,
}) => {
  const world = newWorld({
    permissions: ['patient.record.search', 'patient.sensitive.view', 'patient.identity.edit'],
  });
  const { requests, patients } = await installMockApi(page, world);
  await signIn(page, world);
  await page.goto(`/staff/patients/${KARIM}`);

  await expect(page.getByText(toLocaleDigits('1234567890', 'bn-BD'))).toHaveCount(0);
  await page.getByRole('button', { name: bn.patients.showNid }).click();
  await expect(page.getByText(toLocaleDigits('1234567890', 'bn-BD'))).toBeVisible();
  await expect(page.getByText(bn.patients.nidAuditNotice)).toBeVisible();
  expect(requests.filter((request) => request.path.endsWith('/nid/reveal'))).toHaveLength(1);

  // Another receptionist saves first: this correction must not overwrite it (SP-03).
  patients.state.changedElsewhere = true;
  await page.getByRole('button', { name: bn.patients.correct }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: bn.patients.address }).fill('Mirpur 10');
  await dialog.getByRole('textbox', { name: bn.patients.reason }).fill('Address given at the desk');
  await dialog.getByRole('button', { name: bn.patients.save }).click();

  await expect(dialog.getByText(bn.patients.staleNotice)).toBeVisible();
  await expect(dialog.getByRole('button', { name: bn.patients.reload })).toBeVisible();
  const correction = requests.find((request) => request.path.endsWith('/identity'));
  expect(correction?.body).toEqual({
    expectedVersion: 1,
    reason: 'Address given at the desk',
    changes: { addressText: 'Mirpur 10' },
  });
  expect(correction?.idempotencyKey).toMatch(UUID);
});
