import { expect, Page, test } from '@playwright/test';
import { clearOnboarding } from './support/workspace';

/**
 * The parent account, as it lands. A parent is sent to the children dashboard
 * rather than the workspace, can step into the question bank, and can step back
 * out to the dashboard.
 *
 * Mock mode has no online account service, so the dashboard shows its "needs an
 * online account" state here; the round trip is the same either way. Waits are
 * generous on purpose: a cold dev server and a loaded WebKit runner both take far
 * longer than Chromium does locally.
 */

const signInAsParent = async (page: Page) => {
  await page.goto('/');
  await page.fill('#username', 'parent');
  await page.fill('#password', 'parent');
  await page.click('button[type=submit]');

  // The terms gate applies to every signed-in account, parents included.
  const agree = page.getByRole('button', { name: /agree and continue/i });
  await agree.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
  if (await agree.count()) {
    const gate = page.getByRole('dialog').filter({ has: agree });
    await gate.getByRole('checkbox').first().check({ timeout: 60_000 });
    await agree.click({ timeout: 60_000 });
    await agree.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  }
};

test.describe('parent dashboard', () => {
  test.describe.configure({ timeout: 180_000 });

  test('a parent lands on the dashboard and can browse and come back', async ({ page }) => {
    await signInAsParent(page);

    const heading = page.getByRole('heading', { name: 'Your children', level: 1 });
    await expect(heading).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole('heading', { name: 'Parent accounts need an online account' })
    ).toBeVisible();

    // Browse questions leaves the dashboard for the question bank.
    await page.getByRole('button', { name: 'Browse questions' }).click({ timeout: 60_000 });
    const back = page.getByRole('button', { name: 'Back to your children' });
    await expect(back).toBeVisible({ timeout: 60_000 });
    await expect(heading).toHaveCount(0);

    // First-run dialogs (quick start, syllabus import) open over the question
    // bank. The shared helper clears them, as it does for every other spec.
    await clearOnboarding(page);

    // And the way back returns to the dashboard.
    await back.click({ timeout: 60_000 });
    await expect(heading).toBeVisible({ timeout: 60_000 });
  });
});
