// Sign-in, hospital choice, language, shell and session expiry in a real browser.
// Implements: T-UI-02, AT-I18N-001 (language switch keeps unsaved input), FR-I18N-001,
// ADR-002 evidence (logout clears client state). The API is an in-memory mock that satisfies the
// shared contracts; expected texts come from the catalogs, never from hard-coded strings.
import AxeBuilder from '@axe-core/playwright';
import { messages } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import {
  HOSPITAL_ONE,
  HOSPITAL_TWO,
  installMockApi,
  newWorld,
  type MockWorld,
} from './support/mock-api';

const bn = messages['bn-BD'];
const en = messages.en;

async function signIn(page: Page, world: MockWorld, password = world.password) {
  await page.getByLabel(bn.login.hospitalCodeLabel).fill('demo');
  await page.getByLabel(bn.login.usernameLabel).fill(world.username);
  await page.getByRole('textbox', { name: bn.login.passwordLabel, exact: true }).fill(password);
  await page.getByRole('button', { name: bn.login.submit }).click();
}

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test('the sign-in screen is Bangla first and accessible', async ({ page }) => {
  await installMockApi(page, newWorld());
  await page.goto('/staff/login');

  await expect(page.getByRole('heading', { name: bn.login.title, level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn-BD');
  await expectNoViolations(page);
});

test('switching language keeps what was typed (AT-I18N-001)', async ({ page }) => {
  await installMockApi(page, newWorld());
  await page.goto('/staff/login');

  await page.getByLabel(bn.login.hospitalCodeLabel).fill('demo');

  await page.getByLabel(bn.login.usernameLabel).fill('rahim');
  await page.getByRole('button', { name: en.language.en }).click();

  await expect(page.getByRole('heading', { name: en.login.title, level: 1 })).toBeVisible();
  await expect(page.getByLabel(en.login.usernameLabel)).toHaveValue('rahim');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expectNoViolations(page);
});

test('a wrong password gives a localized error and clears only the password', async ({ page }) => {
  const world = newWorld();
  await installMockApi(page, world);
  await page.goto('/staff/login');
  await signIn(page, world, 'not the password');

  // Live regions of the app and of Next also have role alert; pick the one with the message.
  await expect(
    page.getByRole('alert').filter({ hasText: bn.errors.api.INVALID_CREDENTIALS }),
  ).toBeVisible();
  await expect(page.getByLabel(bn.login.usernameLabel)).toHaveValue('rahim');
  await expect(
    page.getByRole('textbox', { name: bn.login.passwordLabel, exact: true }),
  ).toHaveValue('');
});

test('empty fields are reported per field', async ({ page }) => {
  await installMockApi(page, newWorld());
  await page.goto('/staff/login');
  await page.getByRole('button', { name: bn.login.submit }).click();

  await expect(page.getByText(bn.validation.required)).toHaveCount(3);
  await expect(page.getByLabel(bn.login.hospitalCodeLabel)).toBeFocused();
});

test('a one-hospital user lands on the home screen inside the shell', async ({ page }) => {
  const world = newWorld();
  await installMockApi(page, world);
  await page.goto('/staff/login');
  await signIn(page, world);

  await expect(page).toHaveURL('/staff');
  await expect(page.getByRole('heading', { name: bn.home.title, level: 1 })).toBeVisible();
  await expect(page.getByText(world.displayName).first()).toBeVisible();
  await expect(page.getByText(HOSPITAL_ONE.tenantNameBn as string).first()).toBeVisible();
  await expectNoViolations(page);
});

test('a user with two hospitals chooses one', async ({ page }) => {
  const world = newWorld({ memberships: [HOSPITAL_ONE, HOSPITAL_TWO] });
  const { requests } = await installMockApi(page, world);
  await page.goto('/staff/login');
  await signIn(page, world);

  await expect(page).toHaveURL('/staff/choose-hospital');
  await expect(page.getByRole('heading', { name: bn.chooseHospital.title })).toBeVisible();
  await expectNoViolations(page);

  // Bangla name missing: the English name is the fallback.
  await page
    .getByRole('button', {
      name: bn.chooseHospital.continueWith.replace('{name}', HOSPITAL_TWO.tenantNameEn as string),
    })
    .click();
  await expect(page).toHaveURL('/staff');
  expect(requests.some((r) => r.path === '/auth/session/membership')).toBe(true);
});

test('changing language while signed in is saved with the CSRF token', async ({ page }) => {
  const world = newWorld();
  const { requests } = await installMockApi(page, world);
  await page.goto('/staff/login');
  await signIn(page, world);
  await expect(page).toHaveURL('/staff');

  await page.getByRole('button', { name: en.language.en }).click();
  await expect(page.getByRole('heading', { name: en.home.title, level: 1 })).toBeVisible();

  const saved = requests.find((r) => r.method === 'PATCH' && r.path === '/auth/preferences');
  expect(saved?.body).toEqual({ preferredLang: 'en' });
  expect(saved?.csrf).toMatch(/^csrf-token-/);
});

test('signing out ends the session, protects the shell and forgets the user', async ({ page }) => {
  const world = newWorld();
  await installMockApi(page, world);
  await page.goto('/staff/login');
  await signIn(page, world);
  await expect(page).toHaveURL('/staff');

  await page.getByRole('button', { name: bn.shell.userMenu }).click();
  await page.getByRole('menuitem', { name: bn.common.signOut }).click();
  await expect(page).toHaveURL('/staff/login');

  // The shell is no longer reachable...
  await page.goto('/staff');
  await expect(page).toHaveURL('/staff/login');

  // ...and a different person signing in sees only themselves (no stale session data).
  world.displayName = 'Karim Ahmed';
  await signIn(page, world);
  await expect(page.getByText('Karim Ahmed').first()).toBeVisible();
  await expect(page.getByText('Rahim Uddin')).toHaveCount(0);
});

test('warns before the idle timeout and Stay signed in extends the session', async ({ page }) => {
  const world = newWorld({ idleSeconds: 90 });
  await installMockApi(page, world);
  await page.goto('/staff/login');
  await signIn(page, world);

  const dialog = page.getByRole('dialog', { name: bn.session.expiringTitle });
  await expect(dialog).toBeVisible();
  await expectNoViolations(page);

  world.idleSeconds = 3600;
  await dialog.getByRole('button', { name: bn.session.stay }).click();
  await expect(dialog).toBeHidden();
});

test('phone width uses a bottom tab bar and no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const world = newWorld();
  await installMockApi(page, world);
  await page.goto('/staff/login');
  await signIn(page, world);
  await expect(page).toHaveURL('/staff');

  const bars = page.getByRole('navigation', { name: bn.nav.label });
  await expect(bars).toHaveCount(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectNoViolations(page);
});

test('an unreachable server is reported and can be retried', async ({ page }) => {
  const world = newWorld({ online: false });
  await installMockApi(page, world);
  await page.goto('/staff/login');

  await expect(page.getByRole('alert').filter({ hasText: bn.errors.offline })).toBeVisible();
  world.online = true;
  await page.getByRole('button', { name: bn.common.retry }).click();
  await expect(page.getByRole('heading', { name: bn.login.title, level: 1 })).toBeVisible();
});
