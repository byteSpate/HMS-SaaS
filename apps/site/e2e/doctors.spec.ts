// Doctor directory and profile in a real browser. Implements: T-WEB-07 acceptance; AT-WEB-010,
// AT-WEB-011, AT-WEB-012, AT-WEB-014, AT-WEB-050 (leave notice), AT-WEB-051 (related doctors).
import { expect, test } from '@playwright/test';
import { scan } from './a11y';

// Dr. Tanvir Ahmed's demo leave runs 20 to 30 October 2026 in content/doctors.json. Leave is worked
// out in the browser against the visitor's today, so these tests fix the clock inside that window;
// on the real clock they would start failing once the leave has passed.
const DURING_DEMO_LEAVE = new Date('2026-10-22T03:00:00Z');

test('filters by department and branch together and keeps them in the URL', async ({ page }) => {
  await page.goto('/en/doctors');
  await expect(page.getByTestId('doctor-count')).toHaveText('24 doctors found');
  await page.getByLabel('Department').selectOption('cardiology');
  await page.getByLabel('Branch').selectOption('dhanmondi');
  await expect(page).toHaveURL(/department=cardiology/);
  await expect(page).toHaveURL(/branch=dhanmondi/);
  await expect(page.getByTestId('doctor-count')).toHaveText('1 doctor found');

  // A shared link restores the same filters (AT-WEB-011).
  await page.goto('/en/doctors?department=cardiology&branch=dhanmondi');
  await expect(page.getByTestId('doctor-count')).toHaveText('1 doctor found');
  await expect(
    page.getByTestId('doctor-results').getByRole('link', { name: 'Dr. Farhana Rahman' }),
  ).toBeVisible();
});

test('the filters follow the URL when it changes from outside the form', async ({ page }) => {
  await page.goto('/en/doctors');
  await page.getByLabel('Department').selectOption('cardiology');
  await expect(page).toHaveURL(/department=cardiology/);
  await expect(page.getByTestId('doctor-count')).toHaveText('2 doctors found');

  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Doctors', exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/doctors$/);
  await expect(page.getByTestId('doctor-count')).toHaveText('24 doctors found');
  await expect(page.getByLabel('Department')).toHaveValue('');

  await page.goBack();
  await expect(page.getByTestId('doctor-count')).toHaveText('2 doctors found');
  await expect(page.getByLabel('Department')).toHaveValue('cardiology');
});

test('searches by interest and shows the empty state (AT-WEB-010, AT-WEB-014)', async ({
  page,
}) => {
  await page.goto('/en/doctors');
  await page.getByLabel('Name, speciality or interest').fill('migraine');
  await expect(page.getByTestId('doctor-results')).toContainText('Neurology');
  await page.getByLabel('Name, speciality or interest').fill('zzzz');
  await expect(page.getByTestId('doctor-count')).toHaveText('0 doctors found');
  await expect(page.getByText('No doctor matches your search')).toBeVisible();
});

test('the profile shows the schedule with Bangla digits on /bn (AT-WEB-012)', async ({ page }) => {
  await page.goto('/bn/doctors/farhana-rahman');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ডা. ফারহানা রহমান');
  await expect(page.getByTestId('schedule')).toContainText('সকাল ৯টা');
  await page.goto('/en/doctors/farhana-rahman');
  await expect(page.getByTestId('schedule')).toContainText('9 am');
});

test('a doctor on leave shows the leave notice (AT-WEB-050)', async ({ page }) => {
  await page.clock.setFixedTime(DURING_DEMO_LEAVE);
  await page.goto('/en/doctors/tanvir-ahmed');
  await expect(page.getByTestId('leave-notice')).toContainText('on leave');
});

test('related doctors exclude the doctor and start with the same department (AT-WEB-051)', async ({
  page,
}) => {
  await page.goto('/en/doctors/farhana-rahman');
  const related = page
    .getByRole('region', { name: 'Related doctors' })
    .or(page.locator('section[aria-labelledby="related-heading"]'));
  await expect(related.getByRole('heading', { level: 3 }).first()).toHaveText('Dr. Tanvir Ahmed');
  await expect(related.getByText('Dr. Farhana Rahman')).toHaveCount(0);
});

for (const path of ['/bn/doctors', '/en/doctors/farhana-rahman']) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await scan(page);
    expect(results.violations).toEqual([]);
  });
}

test('a symptom search finds the right doctors and an empty search offers help (critique P1)', async ({
  page,
}) => {
  await page.goto('/bn/doctors');
  await page.getByLabel('নাম, স্পেশালিটি বা রোগ').fill('বুকে ব্যথা');
  await expect(page.getByTestId('doctor-results')).toContainText('কার্ডিওলজি');
  await page.getByLabel('নাম, স্পেশালিটি বা রোগ').fill('zzzz');
  await expect(
    page.getByTestId('doctor-empty').getByRole('link', { name: /ইমার্জেন্সি/ }),
  ).toHaveAttribute('href', /^tel:/);
});

test('cards show the next chamber and fee, and a doctor on leave shows the return day', async ({
  page,
}) => {
  await page.clock.setFixedTime(DURING_DEMO_LEAVE);
  await page.goto('/en/doctors?department=cardiology');
  const card = page.getByTestId('doctor-results').getByRole('article').first();
  await expect(card).toContainText('Fee');
  await expect(card).toContainText(/am|pm/);
  await expect(page.getByTestId('doctor-results')).toContainText('On leave, back on 31 October');
});

// The pages are built ahead of time, so the next chamber is worked out in the browser against
// the visitor's today. Dr. Kamrul Hasan sits Sunday and Thursday at 10 am and Tuesday at 4 pm.
test("the next chamber follows the visitor's day, not the build day", async ({ page }) => {
  const kamrul = page
    .getByTestId('doctor-results')
    .getByRole('article')
    .filter({ hasText: 'Dr. Kamrul Hasan' });

  // Thursday 22 October 2026, 9 am in Dhaka.
  await page.clock.setFixedTime(new Date('2026-10-22T03:00:00Z'));
  await page.goto('/en/doctors?department=medicine');
  await expect(kamrul).toContainText('Today, 10 am');

  // Friday: no session, so the next one is Sunday.
  await page.clock.setFixedTime(new Date('2026-10-23T03:00:00Z'));
  await page.goto('/en/doctors?department=medicine');
  await expect(kamrul).toContainText('Sunday, 10 am');
  await expect(kamrul).not.toContainText('Today');
});
