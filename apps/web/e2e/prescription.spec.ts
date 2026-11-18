// The prescription on the consultation screen in a real browser (T-CLI-03; FR-CLI-004..006;
// UC-CLI-01 steps 4 and 5; UC-CLI-02; FR-CLI-005 print). The API is the contract-valid mock in
// support/mock-prescriptions.ts with the catalogue of support/mock-medicines.ts; texts come from
// the catalogs. Names and medicines are synthetic.
import AxeBuilder from '@axe-core/playwright';
import { messages, toLocaleDigits } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
const digits = (text: string) => toLocaleDigits(text, 'bn-BD');
// next dev compiles each screen on its first visit; CI runs the production build.
test.describe.configure({ timeout: 90_000 });

const DOCTOR = [
  'clinical.consultation.record',
  'clinical.document.sign',
  'clinical.document.amend',
  'clinical.prescription.create',
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

/** Signs in as the doctor and opens the first waiting patient's consultation. */
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

const rxSection = (page: Page) =>
  page.getByRole('region', { name: bn.prescription.title, exact: true });

async function addMedicine(page: Page, text: string, option: string) {
  await page.getByRole('combobox', { name: bn.prescription.searchLabel }).fill(text);
  await page.getByRole('option', { name: new RegExp(option) }).click();
}

test('T-CLI-03: writes a line from the catalogue, autosaves, signs and prints', async ({
  page,
}) => {
  const { requests } = await openConsultation(page);
  const rx = rxSection(page);
  await expect(rx.getByText(bn.prescription.noLines)).toBeVisible();

  await addMedicine(page, 'napa', 'Napa 500 mg Tablet');
  await rx.getByLabel(bn.prescription.dose).fill('1 tablet');
  // Without how often or instructions the line cannot be signed yet.
  await expect(rx.getByRole('button', { name: bn.prescription.sign })).toBeDisabled();
  await rx.getByLabel(bn.prescription.frequency).selectOption({ label: 'Once daily' });
  await rx.getByLabel(bn.prescription.fulfilmentExternal).check();
  await expect
    .poll(() => requests.filter((r) => r.path.endsWith('/prescription/draft')).at(-1)?.body)
    .toMatchObject({
      lines: [{ dose: '1 tablet', fulfilment: 'EXTERNAL', frequencyTermId: expect.any(String) }],
    });
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await rx.getByRole('button', { name: bn.prescription.sign }).click();
  await expect(
    rx.getByText(bn.prescription.versionTitle.replace('{version}', digits('1'))),
  ).toBeVisible();
  await expect(rx.getByText(bn.prescription.fulfilmentExternal)).toBeVisible();
  await expect(rx.getByLabel(bn.prescription.dose)).toHaveCount(0);

  await rx.getByLabel(bn.prescription.printLanguage).selectOption('bilingual');
  await rx.getByRole('button', { name: bn.prescription.print }).click();
  await expect
    .poll(() => requests.find((r) => r.path.endsWith('/prescription/prints'))?.body)
    .toEqual({ language: 'bilingual' });
});

test('UC-CLI-02: amends the signed prescription with a reason into version 2', async ({ page }) => {
  const { requests } = await openConsultation(page);
  const rx = rxSection(page);
  await addMedicine(page, 'amox', 'Amoxil 500 mg Capsule');
  await rx.getByLabel(bn.prescription.instructionsEn).fill('After meals');
  await rx.getByRole('button', { name: bn.prescription.sign }).click();
  await expect(
    rx.getByText(bn.prescription.versionTitle.replace('{version}', digits('1'))),
  ).toBeVisible();

  await rx.getByRole('button', { name: bn.prescription.amend }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.prescription.amendReason).fill('Wrong instructions');
  await dialog.getByRole('button', { name: bn.prescription.amendSubmit }).click();
  await expect(rx.getByLabel(bn.prescription.instructionsEn)).toHaveValue('After meals');
  await rx.getByLabel(bn.prescription.instructionsEn).fill('Before meals');
  await rx.getByRole('button', { name: bn.prescription.sign }).click();

  await expect(
    rx.getByText(bn.prescription.versionTitle.replace('{version}', digits('2'))),
  ).toBeVisible();
  await expect(
    rx.getByText(bn.prescription.amendReasonShown.replace('{reason}', 'Wrong instructions')),
  ).toBeVisible();
  const signs = requests.filter((request) => request.path.endsWith('/prescription/sign'));
  expect(signs).toHaveLength(2);
  expect(signs.every((request) => request.idempotencyKey)).toBe(true);
});

test('a doctor without clinical.prescription.create sees no prescription', async ({ page }) => {
  await openConsultation(page, ['clinical.consultation.record', 'clinical.document.sign']);
  await expect(page.getByRole('heading', { name: bn.prescription.title, exact: true })).toHaveCount(
    0,
  );
});
