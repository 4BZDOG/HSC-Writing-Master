import { test, expect, Page } from '@playwright/test';
import { signIn, clearOnboarding, openFirstQuestion, EVALUATE_BUTTON } from './support/workspace';
import { stubMarking, MARKED_ANSWER } from './support/markingStub';
import { freezeAnimations, measureContrast, ContrastReading } from './support/contrast';

/**
 * The command verb and the syllabus terms in marking feedback, measured in both themes.
 *
 * A highlighted run is the one piece of text on these surfaces painted in a colour the
 * student did not pick: an accent verb, or a term on a tinted chip. Each run is measured
 * against the ground it sits on, with translucent washes composited, and must meet AA in
 * both themes. `tests/unit/feedbackHighlights.test.tsx` pins which words are highlighted;
 * this pins that they can be read.
 */

const writingSurface = (page: Page) => page.locator('textarea').first();

const setTheme = async (page: Page, theme: 'light' | 'dark') => {
  const toggle = page.getByRole('button', { name: new RegExp(`switch to ${theme} theme`, 'i') });
  if (await toggle.count()) {
    await toggle.first().click();
    await page.waitForTimeout(800);
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    .toBe(theme === 'light' ? 'light' : null);
};

/** The readings that paint a highlight: the accent verb, or a term on its emerald chip. */
const HIGHLIGHT_CLASSES = ['text-emerald-400', 'text-emerald-900', 'color-accent'];
const isHighlight = (r: ContrastReading) => HIGHLIGHT_CLASSES.some((c) => r.classes.includes(c));

test.describe('Highlights in marking feedback', () => {
  test.describe.configure({ timeout: 240_000 });

  // The contrast of a colour does not depend on the browser engine, so one run is enough.
  test.skip(({ browserName }) => browserName !== 'chromium', 'measured once, in one engine');

  for (const theme of ['dark', 'light'] as const) {
    test(`every highlighted run meets AA in the ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await stubMarking(page);
      await signIn(page, 'admin');
      await clearOnboarding(page);
      await openFirstQuestion(page);
      await setTheme(page, theme);
      await writingSurface(page).fill(MARKED_ANSWER);
      await page.getByRole('button', { name: EVALUATE_BUTTON }).click();

      // The comparison opens first; the feedback is behind its way forward.
      const carryOn = page.getByRole('button', { name: /See my full feedback/i });
      await expect(carryOn).toBeVisible({ timeout: 40_000 });
      await freezeAnimations(page);
      const review = await measureContrast(page);
      const reviewHighlights = review.readings.filter(isHighlight);

      await carryOn.click();
      await expect(page.getByText(/Marker's commentary/)).toBeVisible({ timeout: 20_000 });
      await freezeAnimations(page);
      const feedback = await measureContrast(page);
      const feedbackHighlights = feedback.readings.filter(isHighlight);

      // The key that explains the highlighting is shown with the feedback.
      await expect(page.getByText('Highlighted:')).toBeVisible();

      // A run of zero would pass vacuously; the verb and the terms must both be found.
      expect(reviewHighlights.length, 'no highlights measured in the comparison').toBeGreaterThan(
        2
      );
      expect(feedbackHighlights.length, 'no highlights measured in the feedback').toBeGreaterThan(
        3
      );

      const failing = [...reviewHighlights, ...feedbackHighlights].filter((r) => r.ratio < r.floor);
      expect(
        failing,
        `${theme} theme: ${failing.length} highlighted runs fall below their contrast floor\n` +
          JSON.stringify(
            failing.map((r) => ({
              text: r.text,
              ratio: r.ratio,
              floor: r.floor,
              classes: r.classes,
            })),
            null,
            1
          )
      ).toEqual([]);
    });
  }
});
