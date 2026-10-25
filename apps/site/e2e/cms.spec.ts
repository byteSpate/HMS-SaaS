// Fictional demo admin: draft/publication separation, stale-tab safety and accessibility.
// Implements: T-CMS-DEMO-01, C-091, C-092. No API or real hospital data is used.
import { expect, test } from '@playwright/test';
import { cmsBnBD } from '@hms/i18n';
import { scan } from './a11y';
for (const locale of ['bn', 'en']) {
  test(`CMS ${locale} is a browser-only, accessible demo on phone and desktop`, async ({
    page,
  }) => {
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/')) apiRequests.push(request.url());
    });
    const response = await page.goto(`/cms/${locale}`);
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      locale === 'en' ? 'Website demo admin' : cmsBnBD.title,
    );
    await expect(
      page.getByRole('button', {
        name: locale === 'en' ? 'Save draft' : cmsBnBD.save,
        exact: true,
      }),
    ).toBeEnabled();
    expect((await scan(page)).violations).toEqual([]);
    await page.setViewportSize({ width: 360, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await scan(page)).violations).toEqual([]);
    expect(apiRequests).toEqual([]);
  });
}
test('drafts persist, publications stay separate, restore works and the public site stays unchanged', async ({
  page,
  context,
}) => {
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
  await page.goto('/cms/en');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Demo draft saved in this browser.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publish demo', exact: true }).click();
  await expect(
    page.getByText('Demo version published in this browser. The public website is unchanged.', {
      exact: true,
    }),
  ).toBeVisible();
  const hero = page
    .locator('li')
    .filter({ has: page.locator('summary').filter({ hasText: 'Section: Hero' }) })
    .first();
  await hero.locator('summary').click();
  const heading = hero
    .getByRole('group', { name: 'Heading', exact: true })
    .getByRole('textbox', { name: 'English', exact: true });
  await heading.fill('Fictional revised demo heading');
  await expect(page.getByRole('button', { name: 'Publish demo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Demo draft saved in this browser.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Preview draft', exact: true })).toBeEnabled();
  const draft = await context.newPage();
  await draft.goto('/cms/en/preview?mode=draft');
  await expect(
    draft.getByRole('heading', { level: 1, name: 'Fictional revised demo heading' }),
  ).toBeVisible();
  const published = await context.newPage();
  await published.goto('/cms/en/preview?mode=published');
  await expect(
    published.getByRole('heading', { level: 1, name: 'Care that knows you by name' }),
  ).toBeVisible();
  const publicSite = await context.newPage();
  await publicSite.goto('/en');
  await expect(
    publicSite.getByRole('heading', { level: 1, name: 'Care that knows you by name' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await page.getByRole('button', { name: 'Restore as draft', exact: true }).click();
  await expect(
    page.getByText('Demo version restored as a draft. Preview and publish when ready.', {
      exact: true,
    }),
  ).toBeVisible();
  await draft.reload();
  await expect(
    draft.getByRole('heading', { level: 1, name: 'Care that knows you by name' }),
  ).toBeVisible();
});
test('stale tabs cannot overwrite newer demo drafts and corrupt storage can be reset', async ({
  page,
  context,
}) => {
  await page.goto('/cms/en');
  const other = await context.newPage();
  await other.goto('/cms/en');
  await expect(other.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await other.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(other.getByRole('alert').filter({ hasText: 'newer demo draft' })).toBeVisible();
  other.on('dialog', (dialog) => {
    void dialog.accept();
  });
  await other.evaluate(() => {
    localStorage.setItem('hms.cms.demo.v1', '{broken');
  });
  await other.reload();
  await expect(other.getByRole('alert').filter({ hasText: 'Reset the demo' })).toBeVisible();
  await other.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
});

test('an emptied list can still add items after navigation and reload', async ({ page }) => {
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
  await page.goto('/cms/en');
  await page.getByRole('button', { name: 'Settings and branding', exact: true }).click();
  const links = page.getByRole('group', { name: 'Social links', exact: true }).first();
  while (await links.getByRole('button', { name: 'Remove', exact: true }).count())
    await links.getByRole('button', { name: 'Remove', exact: true }).first().click();
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page.getByRole('button', { name: 'Settings and branding', exact: true }).click();
  await expect(links.getByRole('button', { name: 'Add item', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings and branding', exact: true }).click();
  await links.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(links.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(1);
});

test('validation explains a problem and opens and focuses its field from another area', async ({
  page,
}) => {
  await page.goto('/cms/en');
  await page.getByRole('button', { name: 'Settings and branding', exact: true }).click();
  const color = page.getByRole('textbox', { name: 'Brand color', exact: true });
  await color.fill('#ffffff');
  await expect(
    page.getByText(
      'Choose a darker six-digit hex color so text stays readable, or clear this field to use the default.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await page
    .getByRole('button', { name: 'Website demo admin / Theme / Brand color', exact: true })
    .click();
  await expect(color).toBeFocused();
  await color.fill('');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
});
