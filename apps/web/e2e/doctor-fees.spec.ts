// Doctor fees in a real browser (T-BIL-01; FR-CFG-002; C-041). The API is the contract-valid mock
// in support/mock-price-lists.ts; texts come from the catalogs. Names and fees are synthetic.
import AxeBuilder from '@axe-core/playwright';
import { isoDateIn, messages, toLocaleDigits } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';
import { MOCK_DOCTORS } from './support/mock-price-lists';

const bn = messages['bn-BD'];
const digits = (text: string) => toLocaleDigits(text, 'bn-BD');
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

async function openFees(page: Page) {
  await page.getByRole('link', { name: bn.nav.doctorFees }).first().click();
  await expect(page.getByRole('heading', { name: bn.doctorFees.inForceTitle })).toBeVisible({
    timeout: 20_000,
  });
}

const ADMIN = ['admin.price.publish'];
const karim = MOCK_DOCTORS[0];

test('sets a first doctor fee in a draft and publishes it now', async ({ page }) => {
  const world = newWorld({ permissions: ADMIN });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await openFees(page);
  await expect(page.getByText(bn.doctorFees.noneInForce)).toBeVisible();

  await page.getByRole('button', { name: bn.doctorFees.startDraft }).click();
  await expect(page.getByText(bn.doctorFees.empty)).toBeVisible();
  await page.getByRole('button', { name: bn.doctorFees.add }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.doctorFees.doctor).selectOption({ label: 'Karim Uddin' });
  // Typed with Bangla digits, as a Bangla keyboard does.
  await dialog.getByLabel(bn.doctorFees.newPatientFee).fill(digits('500'));
  await dialog.getByLabel(bn.doctorFees.followUpFee).fill('300');
  await dialog.getByLabel(bn.doctorFees.followUpDays).fill('14');
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole('button', { name: bn.doctorFees.save }).click();
  await expect(page.getByText(bn.doctorFees.saved).first()).toBeVisible();
  const saved = requests.find((request) => request.method === 'PUT');
  expect(saved?.body).toMatchObject({
    newPatientFee: '500.00',
    followUpFee: '300.00',
    followUpDays: 14,
  });
  expect(saved?.idempotencyKey).toBeTruthy();

  await page.getByRole('button', { name: bn.doctorFees.publish, exact: true }).click();
  const publish = page.getByRole('dialog');
  await expect(
    publish.getByText(new RegExp(`Karim Uddin - ${bn.doctorFees.changeAdded}`)),
  ).toBeVisible();
  await publish.getByRole('button', { name: bn.doctorFees.confirmPublish }).click();
  await expect(page.getByText(bn.doctorFees.published).first()).toBeVisible();
  await expect(page.locator('#draft-heading')).toBeHidden();
  const row = page.getByRole('row', { name: /Karim Uddin/ });
  await expect(row).toContainText(digits('500.00'));
});

test('changes a fee in force from a later date; the old fee stays in force', async ({ page }) => {
  const world = newWorld({ permissions: ADMIN });
  const { priceLists } = await installMockApi(page, world);
  if (!karim) throw new Error('The mock has no doctors');
  priceLists.seedInForce([
    { practitioner: karim, newPatientFee: '500.00', followUpFee: '300.00', followUpDays: 14 },
  ]);
  await signIn(page, world);
  await openFees(page);

  await page.getByRole('button', { name: bn.doctorFees.startDraft }).click();
  await page.getByRole('button', { name: `${bn.doctorFees.edit}: Karim Uddin` }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.doctorFees.newPatientFee).fill('600');
  await dialog.getByRole('button', { name: bn.doctorFees.save }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: bn.doctorFees.publish, exact: true }).click();
  const publish = page.getByRole('dialog');
  await expect(publish.getByText(new RegExp(bn.doctorFees.changeChanged))).toBeVisible();
  await publish.getByText(bn.doctorFees.whenDate).click();
  const confirm = publish.getByRole('button', { name: bn.doctorFees.confirmPublish });
  await expect(confirm).toBeDisabled();
  const tomorrow = isoDateIn(new Date(Date.now() + 86_400_000));
  await publish
    .getByRole('textbox', { name: bn.doctorFees.effectiveDate, exact: true })
    .fill(tomorrow);
  await confirm.click();

  await expect(page.getByRole('heading', { name: bn.doctorFees.scheduledTitle })).toBeVisible();
  // Until tomorrow, the fee in force is still the old one.
  await expect(page.getByRole('row', { name: /Karim Uddin/ })).toContainText(digits('500.00'));
});
