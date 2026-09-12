import { test, expect, Page } from '@playwright/test';
import {
  signIn,
  clearOnboarding,
  openFirstQuestion,
  openVerbRibbon,
  typeAnswer,
  openPanel,
  expandNavigator,
} from './support/workspace';
import {
  freezeAnimations,
  measureContrast,
  remeasureTagged,
  describeReadings,
} from './support/contrast';

/**
 * The light theme, held to the same standard as the dark one.
 *
 * Every light-theme defect this project has shipped was found by a person
 * looking at a screen, and each one was the same mistake: a colour chosen
 * against a near-black surface, carried over to white unchanged. The suite
 * never looked at a colour, so nothing else could have caught them.
 *
 * Two invariants, chosen because each is decidable from computed styles and
 * neither needs a screenshot baseline (which would be tied to the fonts and
 * renderer of whichever machine generated it):
 *
 *   1. **Reading surfaces meet WCAG AA in both themes.** Restricted to text on
 *      a flat, near-grey background — the cards, panels and page. Brand-coloured
 *      chrome is deliberately identical in both themes, so it is a design
 *      decision to take once, not a light-theme oversight to gate on here.
 *   2. **Light is never the neglected twin.** For every element measurable in
 *      both themes, the light theme's contrast may not fall meaningfully below
 *      the dark theme's. This is the actual complaint the invariant exists to
 *      answer, and it is brand-neutral: a chip that is the same colour in both
 *      themes passes, while a tone tuned only against black fails.
 *
 * What this does NOT cover is layout and composition — a header that reads as a
 * dark slab beside its light twin has fine contrast and is still wrong. That
 * still needs eyes, or a pixel baseline generated on the CI runner itself.
 */

/** How far below its dark-theme twin a light reading may sit before it counts. */
const PARITY_TOLERANCE = 0.5;

/** Contrast is a property of the DOM, not the viewport, but the workspace only
 *  lays both cards out side by side above this width. */
const WIDE = { width: 1400, height: 900 };

const setTheme = async (page: Page, theme: 'light' | 'dark') => {
  const toggle = page.getByRole('button', { name: new RegExp(`switch to ${theme} theme`, 'i') });
  if (await toggle.count()) {
    await toggle.first().click();
    // The theme swap animates the surfaces it touches.
    await page.waitForTimeout(800);
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    .toBe(theme === 'light' ? 'light' : null);
};

test.describe('light theme', () => {
  test.describe.configure({ timeout: 120_000 });

  test.skip(({ isMobile }) => !!isMobile, 'measured once, at the width both cards share');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
    await signIn(page);
    await clearOnboarding(page);
    await openFirstQuestion(page);
    // The verb ribbon is shut beneath the breadcrumb, and shut it is invisible
    // to a checker that walks text nodes. Opening it puts roughly 120 more of
    // them into the audit — and until the ribbon rendered in this state at all,
    // this suite was green partly by never having seen the component.
    await openVerbRibbon(page);
  });

  test('every reading surface meets AA, in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await freezeAnimations(page);
      const { readings, unassessed } = await measureContrast(page);

      // A run that measured almost nothing would pass silently and prove
      // nothing — most likely because the workspace never opened.
      expect(readings.length, 'nothing was measured').toBeGreaterThan(20);

      const failures = readings.filter((r) => r.neutralBackground && r.ratio < r.floor);
      expect(
        failures,
        `${theme} theme: ${failures.length} of ${readings.length} text nodes on a plain ` +
          `background fall below their contrast floor ` +
          `(${unassessed} more sit over a gradient and were not assessed)\n` +
          describeReadings(failures)
      ).toEqual([]);
    }
  });

  test('the light theme is never dimmer than the dark one', async ({ page }) => {
    await setTheme(page, 'dark');
    await freezeAnimations(page);
    const { readings } = await measureContrast(page);
    const dark = new Map(readings.map((r) => [r.id, r]));

    await setTheme(page, 'light');
    await freezeAnimations(page);
    const light = await remeasureTagged(page);

    const regressions = readings
      .filter((r) => light[r.id] !== undefined)
      .map((r) => ({ ...r, darkRatio: r.ratio, after: light[r.id] }))
      // A component that changed what it says between the two passes (a live
      // status badge, a counter) is in a different state, not a worse theme.
      .filter((r) => r.after.text === r.text)
      // A brand colour identical in both themes scores identically and is not
      // a regression; only a tone that got worse on white is.
      .filter((r) => r.after.ratio < r.darkRatio - PARITY_TOLERANCE && r.after.ratio < r.floor);

    expect(dark.size, 'nothing was measured').toBeGreaterThan(20);
    expect(
      regressions.map(
        (r) =>
          `"${r.text}" — ${r.darkRatio}:1 dark (${r.color} on ${r.background}), ` +
          `${r.after.ratio}:1 light (${r.after.color} on ${r.after.background})  ${r.selector}`
      ),
      'these read worse in the light theme than in the dark one, and below the floor'
    ).toEqual([]);
  });
});

/**
 * The states the sweep above never reaches.
 *
 * The two tests above open a question and measure, and for a long time that
 * read as "the workspace is covered". It is one screen in ONE state, and the
 * distinction matters more than it sounds: three of the surfaces still dimming
 * text with `opacity` are mounted on that very screen and simply never painted
 * in the state the sweep leaves it in.
 *
 *   - `LiveInsights` is mounted whenever the session is not an exam, but
 *     `buildWritingInsights` returns `[]` at `wordCount === 0`, so with an
 *     empty editor the panel returns `null`.
 *   - `SampleAnswersAccordion` is mounted and shut, and a checker that walks
 *     text nodes cannot see inside a closed disclosure.
 *   - `PromptSelector` is folded to a breadcrumb the moment a question is
 *     chosen — 900 lines of navigator, unmeasured, because the act of getting
 *     to the workspace is also the act of hiding it.
 *
 * None of those is an exotic state. Each is one interaction away, and each is
 * where a student spends most of their time. The verb ribbon was in exactly
 * this position until `openVerbRibbon` existed, and the comment on that helper
 * records what the suite had been doing in the meantime: passing partly by
 * never having seen the component.
 *
 * Each entry drives the page into one state and is measured in both themes.
 * Adding a state here is the cheap half of the work; the expensive half is
 * that a new state usually arrives red.
 */
const STATES: { name: string; reach: (page: Page) => Promise<void> }[] = [
  {
    name: 'a draft in the editor, with the live insights panel open',
    reach: async (page) => {
      await typeAnswer(page);
      await openPanel(page, /live insights/i);
    },
  },
  {
    name: 'the sample answers accordion open',
    reach: async (page) => {
      await openPanel(page, /sample answers/i);
    },
  },
  {
    name: 'the syllabus navigator unfolded',
    reach: async (page) => {
      await expandNavigator(page);
    },
  },
];

test.describe('light theme, past the first screen', () => {
  test.describe.configure({ timeout: 240_000 });

  test.skip(({ isMobile }) => !!isMobile, 'measured once, at the width both cards share');

  for (const state of STATES) {
    test(`every reading surface meets AA with ${state.name}`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await signIn(page);
      await clearOnboarding(page);
      await openFirstQuestion(page);
      await state.reach(page);

      for (const theme of ['light', 'dark'] as const) {
        await setTheme(page, theme);
        await freezeAnimations(page);
        const { readings, unassessed } = await measureContrast(page);

        // The same guard the base sweep carries, and for the same reason: a
        // run that measured almost nothing passes silently and proves nothing.
        // Here it also catches a `reach` that quietly failed to reach.
        expect(readings.length, 'nothing was measured').toBeGreaterThan(20);

        const failures = readings.filter((r) => r.neutralBackground && r.ratio < r.floor);
        expect(
          failures,
          `${theme} theme, ${state.name}: ${failures.length} of ${readings.length} text ` +
            `nodes on a plain background fall below their contrast floor ` +
            `(${unassessed} more sit over a gradient and were not assessed)\n` +
            describeReadings(failures)
        ).toEqual([]);
      }
    });
  }
});
