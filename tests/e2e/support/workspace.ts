import { expect, Page } from '@playwright/test';

/**
 * Getting to a question, shared by every spec that needs one.
 *
 * Each spec grew its own copy of these three steps, and by the third they had
 * started to disagree about timeouts. They are the app's front door, not the
 * subject of any one test, so they live here.
 */

export const signIn = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.fill('#username', 'user');
  await page.fill('#password', 'user');
  await page.click('button[type=submit]');
};

/** The charter gate, then the quick-start guide, then the bundled curriculum. */
export const clearOnboarding = async (page: Page): Promise<void> => {
  // The gate animates in after the mock login's deliberate delay, so wait for
  // it rather than sampling — a bare `count()` here is always zero.
  const agree = page.getByRole('button', { name: /agree and continue/i });
  await agree.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await agree.count()) {
    await page.getByRole('checkbox').first().check();
    await agree.click();
    await agree.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  }
  const guide = page.getByRole('button', { name: /start writing/i });
  await guide.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  await page.keyboard.press('Escape');
  await guide.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});

  // First run offers the bundled curriculum; take it so there is something to
  // answer. It opens behind the guide, so it only appears once that is gone.
  const importButton = page.getByRole('button', { name: /import \d+ items?/i });
  await importButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await importButton.count()) {
    await importButton.first().click();
    await importButton.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }
};

/**
 * Walk the syllabus picker down to a question, taking the first option at each
 * level. Deliberately data-agnostic: the bundled curriculum can change without
 * this needing to know any ids.
 */
export const openFirstQuestion = async (page: Page): Promise<void> => {
  for (const placeholder of [
    'Select Course...',
    'Select Topic...',
    'Select Sub-Topic...',
    'Select Dot Point...',
    'Select Question...',
  ]) {
    const trigger = page.locator('button[aria-haspopup="listbox"]', { hasText: placeholder });
    if (!(await trigger.count())) continue; // already chosen for us
    await trigger.first().click();
    const option = page.getByRole('option').first();
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    await option.click();
  }
  await expect(page.getByRole('heading', { name: /Writing Prompt/i })).toBeVisible({
    timeout: 20_000,
  });
};

/** Sign in, clear the gates and open a question — the usual preamble. */
export const openWorkspace = async (page: Page): Promise<void> => {
  await signIn(page);
  await clearOnboarding(page);
  await openFirstQuestion(page);
};
