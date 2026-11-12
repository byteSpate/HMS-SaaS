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

// T-BIL-04: the cashier desk (UC-BIL-01, UC-BIL-02; C-038, C-039).
const DESK = [
  'billing.cashier_session.manage',
  'billing.payment.record',
  'billing.invoice.issue',
  'patient.record.search',
];
const SALMA = {
  patientId: '0199e0f0-0000-7000-8000-000000000001',
  mrn: 'MRN-000123',
  nameEn: 'Salma Begum',
  nameBn: null,
};

async function openDesk(page: Page, world: MockWorld) {
  await signIn(page, world);
  await page.getByRole('link', { name: bn.nav.cashier }).first().click();
  await page.getByRole('button', { name: /Salma Begum/ }).click({ timeout: 20_000 });
}

test('C-039: one payment pays the doctor fee and the services, then prints the receipt', async ({
  page,
}) => {
  const world = newWorld({ permissions: DESK });
  const { billing, cashierDesk, requests } = await installMockApi(page, world);
  billing.seedOpenSession('1000.00');
  cashierDesk.seedInvoice(SALMA, 'DOCTOR_FEE', [{ itemCode: 'DOCTOR_FEE_NEW', amount: '500.00' }]);
  cashierDesk.seedInvoice(SALMA, 'SERVICE', [
    { itemCode: 'LAB_CBC', itemNameEn: 'CBC', amount: '300.00' },
  ]);
  await openDesk(page, world);

  await expect(page.getByText(bn.print.doctorFeeNew, { exact: false }).first()).toBeVisible();
  await expect(
    page.getByText(bn.cashier.amountToPay.replace('{amount}', money('800.00'))),
  ).toBeVisible();
  await page.getByRole('radio', { name: bn.cashier.methodMOBILE }).check();
  await page.getByLabel(bn.cashier.provider).fill('bKash');
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: bn.cashier.confirm }).click();
  await expect(page.getByRole('heading', { name: bn.cashier.savedTitle })).toBeVisible();
  const paid = requests.find(
    (request) => request.method === 'POST' && request.path === '/billing/payments',
  );
  expect(paid?.body).toMatchObject({
    patientId: SALMA.patientId,
    method: 'MOBILE',
    providerLabel: 'bKash',
    amount: '800.00',
  });
  expect((paid?.body as { allocations: unknown[] }).allocations).toHaveLength(2);
  expect(paid?.idempotencyKey).toBeTruthy();

  await page.getByRole('button', { name: bn.cashier.printReceipt }).first().click();
  await expect(page.getByRole('button', { name: bn.cashier.reprint })).toBeVisible();
  expect(requests.some((request) => request.path.endsWith('/prints'))).toBe(true);
  await expect(page.getByRole('row', { name: /RCPT-000001/ })).toBeVisible();
});

test('C-038: a line cannot be paid more than it owes; a part payment is for that line', async ({
  page,
}) => {
  const world = newWorld({ permissions: DESK });
  const { billing, cashierDesk, requests } = await installMockApi(page, world);
  billing.seedOpenSession('0.00');
  cashierDesk.seedInvoice(SALMA, 'DOCTOR_FEE', [{ itemCode: 'DOCTOR_FEE_NEW', amount: '500.00' }]);
  await openDesk(page, world);

  const card = page.getByRole('region', { name: new RegExp(bn.cashier.invoiceDoctorFee) });
  const amount = card.getByRole('textbox');
  await amount.fill('600');
  await expect(card.getByText(bn.cashier.overBalance.split(' (')[0] ?? '')).toBeVisible();
  const confirm = page.getByRole('button', { name: bn.cashier.confirm });
  await expect(confirm).toBeDisabled();

  await amount.fill(digits('200'));
  await confirm.click();
  await expect(page.getByRole('heading', { name: bn.cashier.savedTitle })).toBeVisible();
  const paid = requests.find(
    (request) => request.method === 'POST' && request.path === '/billing/payments',
  );
  expect(paid?.body).toMatchObject({ amount: '200.00', method: 'CASH' });
});

// T-BIL-05: the payment's answer is lost (FR-BIL-036, SP-08, AT-E2E-003).
test('a lost answer for a saved payment: the desk finds it and never offers to pay again', async ({
  page,
}) => {
  const world = newWorld({ permissions: DESK });
  const { billing, cashierDesk, requests } = await installMockApi(page, world);
  billing.seedOpenSession('0.00');
  cashierDesk.seedInvoice(SALMA, 'DOCTOR_FEE', [{ itemCode: 'DOCTOR_FEE_NEW', amount: '500.00' }]);
  cashierDesk.loseNextAnswer('saved');
  await openDesk(page, world);

  await page.getByRole('button', { name: bn.cashier.confirm }).click();
  await expect(page.getByRole('heading', { name: bn.cashier.savedTitle })).toBeVisible();
  expect(cashierDesk.payments).toHaveLength(1);
  expect(requests.some((request) => request.path.startsWith('/operations/'))).toBe(true);
});

test('a lost answer for a payment not saved: Try again sends the same key once more', async ({
  page,
}) => {
  const world = newWorld({ permissions: DESK });
  const { billing, cashierDesk, requests } = await installMockApi(page, world);
  billing.seedOpenSession('0.00');
  cashierDesk.seedInvoice(SALMA, 'DOCTOR_FEE', [{ itemCode: 'DOCTOR_FEE_NEW', amount: '500.00' }]);
  cashierDesk.loseNextAnswer('notSaved');
  await openDesk(page, world);

  await page.getByRole('button', { name: bn.cashier.confirm }).click();
  await expect(page.getByText(bn.cashier.notSaved)).toBeVisible();
  await expect(page.getByRole('button', { name: bn.cashier.confirm })).toBeHidden();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole('button', { name: bn.cashier.tryAgain }).click();
  await expect(page.getByRole('heading', { name: bn.cashier.savedTitle })).toBeVisible();
  const sent = requests.filter(
    (request) => request.method === 'POST' && request.path === '/billing/payments',
  );
  expect(sent).toHaveLength(2);
  expect(sent[1]?.idempotencyKey).toBe(sent[0]?.idempotencyKey);
  expect(cashierDesk.payments).toHaveLength(1);
});
