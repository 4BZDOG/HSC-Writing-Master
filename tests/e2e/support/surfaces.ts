import { expect, Locator, Page } from '@playwright/test';
import {
  EVALUATE_BUTTON,
  clearOnboarding,
  openFirstQuestion,
  openQuestionWithOutcomes,
  settleVerbRibbon,
  signIn,
} from './workspace';
import { stubMarking, MARKED_ANSWER } from './markingStub';
import type { StatePath } from '../../../types';

/**
 * Driving the page into the surfaces the light-theme checks are about.
 *
 * Shared by light-theme.spec.ts (text over gradients) and
 * light-stark-surfaces.spec.ts (white slabs), so both reach a surface the same
 * way. Each helper leaves the surface open and returns its root locator; a
 * spec then calls `dismissAll` to get back to the bare workspace, which is
 * where the theme toggle is reachable.
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

/**
 * Closes every open dialog, innermost first, until the workspace is showing.
 *
 * A state can stack two dialogs (the legal reader sits on the profile), so one
 * Escape is not always enough. Bounded: if a dialog will not close, the caller's
 * next step fails with its own message, rather than this looping forever.
 */
export const dismissAll = async (page: Page): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    if (!(await page.getByRole('dialog').count())) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
};

/**
 * Opens the question a path names. The workspace reads its path from storage
 * when it mounts, so this stores the path and reloads, rather than walking the
 * pickers, which only reach whichever question sits first in them.
 */
export const openQuestionAtPath = async (page: Page, path: StatePath): Promise<void> => {
  // The key is the app's `STATE_PATH` (utils/storageUtils.ts), which the e2e
  // specs spell out as contribution-loop.spec.ts does.
  await page.evaluate(
    (value) => window.localStorage.setItem('hsc-ai-evaluator-path', JSON.stringify(value)),
    path
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: /Writing Prompt/i })).toBeVisible({
    timeout: 20_000,
  });
  await settleVerbRibbon(page);
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

/**
 * Signs in, clears the gates and opens the first question, or the first one
 * that links outcomes. Once per spec, so the many states that follow share one
 * session instead of paying for a sign-in each.
 *
 * `openFirstQuestion` and the outcome walk click pickers, so a stuck picker can
 * hang without a message. The page's default timeout bounds those clicks for
 * the duration of this call, and one fresh attempt follows a failure. CI
 * retries failed tests as well.
 */
export const openWorkspaceQuestion = async (
  page: Page,
  account: 'user' | 'admin',
  outcomes = false
): Promise<void> => {
  let firstFailure = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    page.setDefaultTimeout(30_000);
    try {
      await signIn(page, account);
      await clearOnboarding(page);
      await openFirstQuestion(page);
      if (outcomes) await openQuestionWithOutcomes(page);
      return;
    } catch (error) {
      // Both failures are kept. The second on its own is usually a sign-in
      // timeout, because the first attempt's session is still in storage and
      // signing in finds the workspace, not the form.
      if (attempt === 2) {
        throw new Error(
          `the workspace did not open. First attempt: ${firstFailure}\nSecond attempt: ${String(error)}`
        );
      }
      firstFailure = String(error).slice(0, 800);
      await page
        .evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        })
        .catch(() => {});
    } finally {
      page.setDefaultTimeout(0);
    }
  }
};
