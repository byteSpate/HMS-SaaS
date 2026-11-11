// Appointments in a real browser (T-SCH-02; FR-SCH-002..005; UC-SCH-01/02; C-035). The API is the
// contract-valid mock in support/mock-appointments.ts; texts come from the catalogs.
import AxeBuilder from '@axe-core/playwright';
import type { ScheduleSession } from '@hms/contracts';
import { isoDateIn, messages, toLocaleDigits } from '@hms/i18n';
import { expect, type Page, test } from '@playwright/test';
import { installMockApi, newWorld, type MockWorld } from './support/mock-api';

const bn = messages['bn-BD'];
const KARIM = '0199e0b0-0000-7000-8000-000000000001';
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

/** A published session on a hospital date this many days from today. */
function sessionOn(
  daysFromToday: number,
  n: number,
  times: { start: string; end: string },
  booked = 0,
) {
  const date = isoDateIn(new Date(Date.now() + daysFromToday * 86_400_000));
  const at = (time: string) => new Date(`${date}T${time}:00+06:00`).toISOString();
  const session: ScheduleSession = {
    sessionId: `0199e0b0-0000-7000-8000-${String(850 + n).padStart(12, '0')}`,
    practitioner: {
      practitionerId: '0199e0b0-0000-7000-8000-000000000801',
      nameBn: null,
      nameEn: 'Karim Uddin',
      specialty: 'Medicine',
      department: null,
    },
    sessionDate: date,
    startTime: times.start,
    endTime: times.end,
    startsAt: at(times.start),
    endsAt: at(times.end),
    capacity: 2,
    bookedCount: booked,
    status: 'PUBLISHED',
    version: 2,
  };
  return session;
}

/** A published session tomorrow (hospital date), so it has not ended whatever the time now. */
const tomorrowSession = (n: number, times: { start: string; end: string }, booked = 0) =>
  sessionOn(1, n, times, booked);

const BOOKER = ['patient.record.search', 'scheduling.appointment.book'];
const RECEPTION = [...BOOKER, 'visit.checkin'];

async function openRecord(page: Page) {
  await page.goto(`/staff/patients/${KARIM}`);
  await expect(page.getByRole('heading', { name: bn.appointments.sectionTitle })).toBeVisible({
    timeout: 20_000,
  });
}

/** Picks, in the open dialog, the session that starts at `start` (Bangla digits). */
async function chooseSession(page: Page, start: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: new RegExp(start) }).check();
  return dialog;
}

test('books from the patient record, then cancels with a reason', async ({ page }) => {
  const world = newWorld({ permissions: BOOKER });
  const { requests, scheduleSessions } = await installMockApi(page, world);
  scheduleSessions.sessions.push(tomorrowSession(1, { start: '17:00', end: '21:00' }));
  await signIn(page, world);
  await openRecord(page);
  await expect(page.getByText(bn.appointments.empty)).toBeVisible();

  await page.getByRole('button', { name: bn.appointments.book }).click();
  const dialog = await chooseSession(page, '১৭:০০');
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole('button', { name: bn.appointments.confirmBook }).click();
  await expect(page.getByText(bn.appointments.booked).first()).toBeVisible();
  const booked = requests.find((r) => r.method === 'POST' && r.path === '/appointments');
  expect(booked?.idempotencyKey).toBeTruthy();
  expect(booked?.body).toMatchObject({ patientId: KARIM });

  const row = page.getByRole('row', { name: /Karim Uddin/ });
  await expect(row.getByText(bn.appointments.statusBOOKED)).toBeVisible();
  await row.getByRole('button', { name: new RegExp(bn.appointments.cancel) }).click();
  const confirm = page.getByRole('dialog');
  const yes = confirm.getByRole('button', { name: bn.appointments.cancelConfirm });
  await expect(yes).toBeDisabled();
  await confirm.getByLabel(bn.appointments.cancelReason).fill('Patient called to cancel');
  await yes.click();
  await expect(row.getByText(bn.appointments.statusCANCELLED)).toBeVisible();
  await expect(row.getByText('Patient called to cancel')).toBeVisible();
});

test('changing the week clears the chosen session, so Book cannot send a hidden one', async ({
  page,
}) => {
  const world = newWorld({ permissions: BOOKER });
  const { scheduleSessions } = await installMockApi(page, world);
  scheduleSessions.sessions.push(tomorrowSession(4, { start: '17:00', end: '21:00' }));
  await signIn(page, world);
  await openRecord(page);

  await page.getByRole('button', { name: bn.appointments.book }).click();
  const dialog = await chooseSession(page, toLocaleDigits('17:00', 'bn-BD'));
  const confirm = dialog.getByRole('button', { name: bn.appointments.confirmBook });
  await expect(confirm).toBeEnabled();
  await dialog.getByRole('button', { name: bn.schedules.nextWeek }).click();
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('button', { name: bn.schedules.previousWeek }).click();
  await expect(dialog.getByRole('radio', { name: /Karim Uddin/ })).not.toBeChecked();
  await expect(confirm).toBeDisabled();
});

test('a full session cannot be chosen, and a lost race says the session is full', async ({
  page,
}) => {
  const world = newWorld({ permissions: BOOKER });
  const { scheduleSessions, appointments } = await installMockApi(page, world);
  scheduleSessions.sessions.push(
    tomorrowSession(1, { start: '09:00', end: '12:00' }, 2),
    tomorrowSession(2, { start: '17:00', end: '21:00' }, 1),
  );
  await signIn(page, world);
  await openRecord(page);
  await page.getByRole('button', { name: bn.appointments.book }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /০৯:০০/ })).toBeDisabled();
  await expect(dialog.getByText(bn.appointments.full)).toBeVisible();

  await chooseSession(page, '১৭:০০');
  appointments.state.lastPlaceTakenElsewhere = true;
  await dialog.getByRole('button', { name: bn.appointments.confirmBook }).click();
  await expect(dialog.getByText(bn.errors.api.CAPACITY_FULL)).toBeVisible();
});

test('reschedules to another session; the old one shows as rescheduled', async ({ page }) => {
  const world = newWorld({ permissions: BOOKER });
  const { scheduleSessions } = await installMockApi(page, world);
  scheduleSessions.sessions.push(
    tomorrowSession(1, { start: '09:00', end: '12:00' }),
    tomorrowSession(2, { start: '17:00', end: '21:00' }),
  );
  await signIn(page, world);
  await openRecord(page);
  await page.getByRole('button', { name: bn.appointments.book }).click();
  const book = await chooseSession(page, '০৯:০০');
  await book.getByRole('button', { name: bn.appointments.confirmBook }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: new RegExp(bn.appointments.reschedule) }).click();
  const move = await chooseSession(page, '১৭:০০');
  await move.getByRole('button', { name: bn.appointments.confirmReschedule }).click();
  await expect(page.getByText(bn.appointments.rescheduled).first()).toBeVisible();
  await expect(page.getByText(bn.appointments.statusRESCHEDULED)).toBeVisible();
  await expect(page.getByText(bn.appointments.statusBOOKED)).toBeVisible();
});

test("the schedules page shows a session's patients", async ({ page }) => {
  const world = newWorld({ permissions: [...BOOKER, 'scheduling.schedule.manage'] });
  const { scheduleSessions } = await installMockApi(page, world);
  scheduleSessions.sessions.push(tomorrowSession(1, { start: '17:00', end: '21:00' }));
  await signIn(page, world);
  await openRecord(page);
  await page.getByRole('button', { name: bn.appointments.book }).click();
  const book = await chooseSession(page, '১৭:০০');
  await book.getByRole('button', { name: bn.appointments.confirmBook }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('link', { name: bn.nav.schedules }).first().click();
  const row = page.getByRole('row', { name: /Karim Uddin/ });
  await row.getByRole('button', { name: new RegExp(bn.appointments.patients) }).click({
    timeout: 20_000,
  });
  const list = page.getByRole('dialog');
  await expect(list.getByText('Karim Ahmed')).toBeVisible();
  await expect(list.getByText(bn.appointments.statusBOOKED)).toBeVisible();
});

test("checks in today's booking: the serial number and the doctor fee due", async ({ page }) => {
  const world = newWorld({ permissions: RECEPTION });
  const { requests, scheduleSessions } = await installMockApi(page, world);
  // All day, so it is still open for booking whenever the test runs.
  scheduleSessions.sessions.push(sessionOn(0, 5, { start: '00:00', end: '23:59' }));
  await signIn(page, world);
  await openRecord(page);
  await page.getByRole('button', { name: bn.appointments.book }).click();
  const book = await chooseSession(page, toLocaleDigits('00:00', 'bn-BD'));
  await book.getByRole('button', { name: bn.appointments.confirmBook }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: new RegExp(bn.checkIn.button) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(bn.checkIn.hint)).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole('button', { name: bn.checkIn.confirm }).click();
  await expect(dialog.getByText(bn.checkIn.serial)).toBeVisible();
  await expect(dialog.getByText(toLocaleDigits('1', 'bn-BD'), { exact: true })).toBeVisible();
  await expect(dialog).toContainText('INV-000001');
  await expect(dialog).toContainText(toLocaleDigits('500.00', 'bn-BD'));
  const sent = requests.find((request) => request.path === '/visits/check-in');
  expect(sent?.idempotencyKey).toBeTruthy();
  await dialog.getByRole('button', { name: bn.common.close }).last().click();
  await expect(page.getByRole('button', { name: new RegExp(bn.checkIn.button) })).toBeHidden();
});

test('without a doctor fee the check-in still succeeds and says so', async ({ page }) => {
  const world = newWorld({ permissions: RECEPTION });
  const { scheduleSessions, appointments } = await installMockApi(page, world);
  appointments.state.doctorFee = null;
  scheduleSessions.sessions.push(sessionOn(0, 6, { start: '00:00', end: '23:59' }));
  await signIn(page, world);
  await openRecord(page);
  await page.getByRole('button', { name: bn.appointments.book }).click();
  const book = await chooseSession(page, toLocaleDigits('00:00', 'bn-BD'));
  await book.getByRole('button', { name: bn.appointments.confirmBook }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: new RegExp(bn.checkIn.button) }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: bn.checkIn.confirm }).click();
  await expect(dialog.getByText(bn.checkIn.feeMissing)).toBeVisible();
});
