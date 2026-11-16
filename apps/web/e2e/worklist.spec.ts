// The doctor worklist and the consultation note in a real browser (T-CLI-01, T-CLI-02; FR-CLI-002,
// FR-CLI-003, FR-CLI-007; UC-CLI-01; UC-CLI-02; SCR-08; W-03; F 4.3; ADR-015; AT-CLI-003..006
// browser part). The API is the contract-valid mock in
// support/mock-worklist.ts; texts come from the catalogs. Names are synthetic.
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

async function openWorklist(page: Page) {
  await page.getByRole('link', { name: bn.nav.worklist }).first().click();
  await expect(page.getByRole('heading', { name: bn.worklist.title })).toBeVisible({
    timeout: 20_000,
  });
}

const rowOf = (page: Page, name: string) => page.getByRole('row', { name: new RegExp(name) });

test('shows the statuses; waiting for payment is greyed and cannot be opened', async ({ page }) => {
  const world = newWorld({ permissions: DOCTOR });
  await installMockApi(page, world);
  await signIn(page, world);
  await openWorklist(page);

  const sessionTitle = bn.worklist.sessionTitle
    .replace('{start}', digits('17:00'))
    .replace('{end}', digits('21:00'));
  await expect(page.getByRole('heading', { name: sessionTitle })).toBeVisible();
  const salma = rowOf(page, 'Salma Begum');
  await expect(salma).toContainText(bn.worklist.statusWAITING);
  await expect(salma.getByRole('button', { name: bn.worklist.start })).toBeVisible();
  const rahim = rowOf(page, 'Rahim Uddin');
  await expect(rahim).toContainText(bn.worklist.statusWAITING_PAYMENT);
  await expect(rahim).toContainText(bn.worklist.cannotOpen);
  await expect(rahim.getByRole('button')).toHaveCount(0);
  await expect(rowOf(page, 'Karim Ahmed')).toContainText(bn.worklist.statusEXPECTED);
  await expect(page.getByText(bn.worklist.updated.replace(' {time}', ''))).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('F 4.3: Enter opens the next waiting patient with the version and a key', async ({ page }) => {
  const world = newWorld({ permissions: DOCTOR });
  const { requests } = await installMockApi(page, world);
  await signIn(page, world);
  await openWorklist(page);
  await expect(rowOf(page, 'Salma Begum')).toBeVisible();

  await expect(page.getByRole('button', { name: bn.worklist.openNext })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/staff\/consultations\//);
  await expect(page.getByRole('heading', { name: 'Salma Begum' })).toBeVisible();
  await expect(page.getByText(bn.worklist.statusIN_CONSULTATION)).toBeVisible();
  const started = requests.find((request) => request.path.endsWith('/consultation/start'));
  expect(started?.body).toEqual({ expectedVersion: 1 });
  expect(started?.idempotencyKey).toBeTruthy();

  await page.getByRole('link', { name: bn.consultation.back }).click();
  const salma = rowOf(page, 'Salma Begum');
  await expect(salma).toContainText(bn.worklist.statusIN_CONSULTATION);
  await expect(salma.getByRole('link', { name: bn.worklist.continue })).toBeVisible();
});

test('ADR-015: a refresh sends the last ETag, keeps the list on 304, shows a payment', async ({
  page,
}) => {
  const world = newWorld({ permissions: DOCTOR });
  const { requests, worklist } = await installMockApi(page, world);
  await signIn(page, world);
  await openWorklist(page);
  await expect(rowOf(page, 'Rahim Uddin')).toContainText(bn.worklist.statusWAITING_PAYMENT);

  await page.getByRole('button', { name: bn.worklist.refresh }).click();
  await expect
    .poll(() => requests.filter((request) => request.path === '/worklist').at(-1)?.ifNoneMatch)
    .toBe('"worklist-1"');
  await expect(rowOf(page, 'Rahim Uddin')).toContainText(bn.worklist.statusWAITING_PAYMENT);

  worklist.pay(worklist.entries[1]?.appointmentId ?? '');
  await page.getByRole('button', { name: bn.worklist.refresh }).click();
  const rahim = rowOf(page, 'Rahim Uddin');
  await expect(rahim).toContainText(bn.worklist.statusWAITING);
  await expect(rahim.getByRole('button', { name: bn.worklist.start })).toBeVisible();
});

test('an account without a linked practitioner is told why the list is empty', async ({ page }) => {
  const world = newWorld({ permissions: DOCTOR });
  const { worklist } = await installMockApi(page, world);
  worklist.unlink();
  await signIn(page, world);
  await openWorklist(page);
  await expect(page.getByText(bn.worklist.notLinked)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
});

/** Signs in as the doctor and opens the first waiting patient's consultation. */
async function openConsultation(page: Page, permissions = DOCTOR) {
  const world = newWorld({ permissions });
  const api = await installMockApi(page, world);
  await signIn(page, world);
  await openWorklist(page);
  await expect(page.getByRole('button', { name: bn.worklist.openNext })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: bn.note.title })).toBeVisible();
  return api;
}

test('T-CLI-02: the draft autosaves, signs as version 1, and is amended as version 2', async ({
  page,
}) => {
  const { requests } = await openConsultation(page);

  await page.getByLabel(bn.note.section.complaint).fill('Fever for three days');
  await page.getByLabel(bn.note.allergy.KNOWN_ALLERGIES).check();
  await page.getByLabel(bn.note.allergyItems).fill('Penicillin');
  await expect(page.getByText(bn.note.savedAt.replace(' {time}', ''))).toBeVisible();
  const drafts = requests.filter((request) => request.path.endsWith('/note/draft'));
  expect(drafts[0]?.body).toMatchObject({ expectedVersion: 0 });
  expect(drafts.at(-1)?.body).toMatchObject({
    content: {
      complaint: 'Fever for three days',
      allergies: { status: 'KNOWN_ALLERGIES', items: ['Penicillin'] },
    },
  });
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByLabel(bn.note.section.assessment).press('Control+Enter');
  await expect(
    page.getByText(bn.note.versionTitle.replace('{version}', digits('1'))),
  ).toBeVisible();
  await expect(page.getByText(bn.worklist.statusCONSULTED)).toBeVisible();
  await expect(page.getByLabel(bn.note.section.complaint)).toHaveCount(0);

  await page.getByRole('button', { name: bn.note.amend }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(bn.note.amendReason).fill('Allergy was recorded wrongly');
  await dialog.getByRole('button', { name: bn.note.amendSubmit }).click();
  await expect(page.getByLabel(bn.note.section.complaint)).toHaveValue('Fever for three days');
  await page.getByLabel(bn.note.allergy.NO_KNOWN_ALLERGIES).check();
  await page.getByRole('button', { name: bn.note.sign }).click();

  await expect(
    page.getByText(bn.note.versionTitle.replace('{version}', digits('2'))),
  ).toBeVisible();
  await expect(page.getByText(bn.note.amended)).toBeVisible();
  await expect(
    page.getByText(bn.note.amendReasonShown.replace('{reason}', 'Allergy was recorded wrongly')),
  ).toBeVisible();
  await page.getByText(bn.note.earlierVersions).click();
  await expect(
    page.getByText(bn.note.versionTitle.replace('{version}', digits('1'))),
  ).toBeVisible();
  const signs = requests.filter((request) => request.path.endsWith('/note/sign'));
  expect(signs).toHaveLength(2);
  expect(signs.every((request) => request.idempotencyKey)).toBe(true);
});

test('UC-CLI-01 D2: without the sign permission the doctor drafts and discards only', async ({
  page,
}) => {
  await openConsultation(page, ['clinical.consultation.record']);
  await expect(page.getByText(bn.note.cannotSign)).toBeVisible();
  await expect(page.getByRole('button', { name: bn.note.sign })).toHaveCount(0);

  await page.getByLabel(bn.note.section.advice).fill('Rest and fluids');
  await expect(page.getByText(bn.note.savedAt.replace(' {time}', ''))).toBeVisible();
  await page.getByRole('button', { name: bn.note.discard }).click();
  await expect(page.getByText(bn.note.discarded).first()).toBeVisible();
  await expect(page.getByLabel(bn.note.section.advice)).toHaveValue('');
});
