// Second factor in a real browser (T-ACC-04; FR-ACC-006; AT-ACC-009 UI part): a privileged
// user is taken to set-up after sign-in, sees the QR code and key, confirms with a code, sees the
// recovery codes once and then reaches the shell. At the next sign-in only the code is asked.
// The API is the contract-valid mock; texts come from the catalogs.
import AxeBuilder from '@axe-core/playwright';
import { messages } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import {
  installMockApi,
  MOCK_RECOVERY_CODES,
  MOCK_TOTP_CODE,
  newWorld,
  type MockWorld,
} from './support/mock-api';

const bn = messages['bn-BD'];

async function signIn(page: Page, world: MockWorld) {
  await page.goto('/staff/login');
  await page.getByLabel(bn.login.usernameLabel).fill(world.username);
  await page.getByLabel(bn.login.passwordLabel).fill(world.password);
  await page.getByRole('button', { name: bn.login.submit }).click();
}

test('a privileged user sets up the second factor before the shell', async ({ page }) => {
  const world = newWorld({ mfaRequired: true });
  await installMockApi(page, world);
  await signIn(page, world);

  await expect(page).toHaveURL(/\/staff\/mfa$/);
  await expect(page.getByRole('heading', { name: bn.mfa.setupTitle, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: bn.mfa.startSetup }).click();
  await expect(page.getByRole('img', { name: bn.mfa.qrLabel })).toBeVisible();
  await expect(page.getByTestId('mfa-secret')).toHaveText(
    'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP',
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByLabel(bn.mfa.codeLabel).fill('000000');
  await page.getByRole('button', { name: bn.mfa.turnOn }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: bn.errors.api.MFA_CODE_INVALID }),
  ).toBeVisible();

  await page.getByLabel(bn.mfa.codeLabel).fill(MOCK_TOTP_CODE);
  await page.getByRole('button', { name: bn.mfa.turnOn }).click();
  await expect(page.getByRole('heading', { name: bn.mfa.recoveryTitle })).toBeVisible();
  await expect(page.getByTestId('recovery-codes').getByRole('listitem')).toHaveCount(10);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: bn.mfa.recoverySaved }).click();

  await expect(page).toHaveURL(/\/staff$/);
});

test('the recovery codes can be copied in one click', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const world = newWorld({ mfaRequired: true });
  await installMockApi(page, world);
  await signIn(page, world);
  await page.getByRole('button', { name: bn.mfa.startSetup }).click();
  await page.getByLabel(bn.mfa.codeLabel).fill(MOCK_TOTP_CODE);
  await page.getByRole('button', { name: bn.mfa.turnOn }).click();

  await page.getByRole('button', { name: bn.mfa.copyCodes }).click();
  await expect(page.getByRole('button', { name: bn.mfa.codesCopied })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // The Windows clipboard turns "\n" into "\r\n", so compare lines.
  expect(copied.split(/\r?\n/)).toEqual(MOCK_RECOVERY_CODES);
});

test('an enrolled user enters the code, or a recovery code, after sign-in', async ({ page }) => {
  const world = newWorld({ mfaRequired: true, mfaEnrolled: true });
  await installMockApi(page, world);
  await signIn(page, world);

  await expect(page.getByRole('heading', { name: bn.mfa.verifyTitle, level: 1 })).toBeVisible();
  await page.getByRole('button', { name: bn.mfa.useRecoveryCode }).click();
  await page.getByLabel(bn.mfa.recoveryCodeLabel).fill(MOCK_RECOVERY_CODES[0] ?? '');
  await page.getByRole('button', { name: bn.mfa.continue }).click();

  await expect(page).toHaveURL(/\/staff$/);
});

test('other staff never see the second-factor screen', async ({ page }) => {
  const world = newWorld();
  await installMockApi(page, world);
  await signIn(page, world);
  await expect(page).toHaveURL(/\/staff$/);
});
