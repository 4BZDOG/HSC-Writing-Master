import { expect, Locator, Page } from '@playwright/test';
import {
  EVALUATE_BUTTON,
  clearOnboarding,
  openFirstQuestion,
  openQuestionWithOutcomes,
  signIn,
} from './workspace';
import { stubMarking, MARKED_ANSWER } from './markingStub';

/**
 * Driving the page into the surfaces the light-theme checks are about.
 *
 * Shared by light-theme.spec.ts (text over gradients) and
 * light-stark-surfaces.spec.ts (white slabs), so both reach a surface the same
 * way. Each helper leaves the surface open and returns its root locator.
 */

/**
 * Switches theme through the app's own toggle, and waits for it to land.
 *
 * Call this on the bare workspace, not with a modal open: the toggle sits
 * behind an open dialog's backdrop, and an unbounded click then waits out the
 * whole test. The bounded click turns that into a named failure instead.
 */
export const setTheme = async (page: Page, theme: 'light' | 'dark') => {
  const toggle = page.getByRole('button', { name: new RegExp(`switch to ${theme} theme`, 'i') });
  if (await toggle.count()) {
    await toggle.first().click({ timeout: 15_000 });
    // The theme swap animates the surfaces it touches.
    await page.waitForTimeout(800);
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    .toBe(theme === 'light' ? 'light' : null);
};

/** The profile dialog, with its head as the header element. */
export const openProfile = async (page: Page): Promise<Locator> => {
  await page
    .getByRole('button', { name: /open your profile/i })
    .first()
    .click();
  const profile = page.getByRole('dialog', { name: 'Your profile' });
  await expect(profile).toBeVisible({ timeout: 15_000 });
  return profile;
};

/** The command verb sheet, opened from the question's verb. */
export const openVerbSheet = async (page: Page): Promise<Locator> => {
  await page.locator('[aria-label^="Open the command verb guide"]').first().click();
  const sheet = page.locator('[aria-labelledby="command-term-title"]');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  return sheet;
};

/**
 * Selects a question whose outcome label is on screen.
 *
 * The label is drawn only once the course's outcome list has loaded, which
 * happens after the first question opens. `openQuestionWithOutcomes` checks for
 * the label once, with no wait, so on a first run it walks the syllabus and
 * fails with the label still on its way. Give it the moment first, and walk
 * only if it genuinely does not come.
 */
export const openOutcomeQuestion = async (page: Page): Promise<void> => {
  const label = page.getByRole('button', { name: /Read before you write/i });
  const arrived = await label
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(
      () => true,
      () => false
    );
  if (!arrived) await openQuestionWithOutcomes(page);
};

/**
 * Signs in, clears the gates and opens the first question, or the first one
 * that links outcomes.
 *
 * `openFirstQuestion` clicks its pickers with no timeout, so when the bundled
 * curriculum is still settling under load a picker can stay "not stable" for
 * the whole test budget: two runs of this suite hung for four minutes that way,
 * with no assertion anywhere. One bounded attempt, then a fresh sign-in and one
 * more, turns a hang into a retry. CI retries failed tests as well.
 */
export const openWorkspaceQuestion = async (
  page: Page,
  account: 'user' | 'admin',
  outcomes = false
): Promise<void> => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    page.setDefaultTimeout(30_000);
    try {
      await signIn(page, account);
      await clearOnboarding(page);
      await openFirstQuestion(page);
      if (outcomes) await openOutcomeQuestion(page);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    } finally {
      page.setDefaultTimeout(0);
    }
  }
};

/** The outcome brief, opened from the label above the question's outcomes. */
export const openOutcomeBrief = async (page: Page): Promise<Locator> => {
  await page
    .getByTitle(/Open the outcome brief/i)
    .first()
    .click();
  const brief = page.locator('[aria-labelledby="outcome-brief-title"]');
  await expect(brief).toBeVisible({ timeout: 15_000 });
  return brief;
};

/**
 * Marks the stubbed answer and opens the feedback modal past the comparison.
 * Needs an account that may mark: `admin`, as feedback-highlights.spec.ts does.
 */
export const openFeedbackAfterMarking = async (page: Page): Promise<Locator> => {
  await stubMarking(page);
  await page.locator('textarea').first().fill(MARKED_ANSWER);
  await page.getByRole('button', { name: EVALUATE_BUTTON }).click();
  const carryOn = page.getByRole('button', { name: /See my full feedback/i });
  await expect(carryOn).toBeVisible({ timeout: 40_000 });
  await carryOn.click();
  const commentary = page.getByText(/Marker's commentary/);
  await expect(commentary).toBeVisible({ timeout: 20_000 });
  return page.getByRole('dialog').filter({ has: commentary }).first();
};
