import { test, expect, Page, Locator } from '@playwright/test';
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
import { measureGradientContrast, describeGradientReadings } from './support/gradientContrast';
import {
  setTheme,
  dismissAll,
  openWorkspaceQuestion,
  openProfile,
  openVerbSheet,
  openOutcomeBrief,
  openFeedbackAfterMarking,
} from './support/surfaces';

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
 *   - `DraftCheck` rests on a blank draft, so the base sweep sees its header
 *     row but never its contents: the notes themselves only exist once there
 *     is a draft, and they sit behind the panel's own toggle.
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
const STATES: {
  name: string;
  reach: (page: Page) => Promise<void>;
  /** Which mock account to reach the state as. Defaults to the free tier,
   *  which is what most of the app is used as; a curator-only surface has to
   *  say so or its trigger is simply not in the DOM. */
  as?: 'user' | 'admin';
}[] = [
  {
    name: 'a draft in the editor, with the draft check open',
    reach: async (page) => {
      await typeAnswer(page);
      await openPanel(page, /draft check/i);
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
  {
    // The reference rail's disclosures: the syllabus terms and the marking
    // guide. ("What's Assessed", "Common mistakes" and "Grade Standards" are off
    // the rail for now — add them back here when they return.)
    name: 'the reference panels open',
    reach: async (page) => {
      await openPanel(page, /syllabus terms/i);
      await openPanel(page, /marking guide/i);
    },
  },
  // NOT here, and honestly out of reach: the writing clock's urgency tones.
  // `text-amber-700` lights under a minute remaining and `text-red-600` past
  // the budget, and the budget is `getRecommendedTime` — two minutes at the
  // very shortest, four to fourteen for anything a student actually writes.
  // A sweep state cannot sit through that, and the clock pauses itself after
  // three idle minutes in Coach Mode precisely so a tab left open does not
  // keep counting, so waiting does not even get there.
  //
  // Saving elapsed time on the draft made the state RESTORABLE but not
  // reachable: seeding it means writing into IndexedDB behind the app's back,
  // which is a fixture pretending to be a user. `tests/unit/writingTimer.test.tsx`
  // covers which tone is applied when, including restored past the budget;
  // what nothing measures is the ratio those two tones actually make on the
  // stats strip. Worth remembering before either is retuned.
  //
  // NOT here, though it should be: the question generator modal, which holds
  // two of the sites this pass fixed and is the only unvisited MODAL among
  // them. Reaching it is circular. Its trigger renders only when a prompt is
  // selected AND the navigator is unfolded — but unfolding the navigator drops
  // the sub-topic back to unselected, and re-selecting a question folds the
  // navigator again and takes the trigger with it. Two attempts timed out
  // clicking a button that was never in the DOM (the second as `admin`, since
  // generation is gated on `canUseAiGeneration` — that part was a real gate
  // and the `as` field above exists because of it).
  //
  // Left out rather than left flaky. Those two sites are covered by
  // `tests/unit/textDimming.test.ts`, which is pattern-matching rather than
  // measurement — worth remembering when the next reading in there is close to
  // the floor.
];

test.describe('light theme, past the first screen', () => {
  test.describe.configure({ timeout: 240_000 });

  test.skip(({ isMobile }) => !!isMobile, 'measured once, at the width both cards share');

  for (const state of STATES) {
    test(`every reading surface meets AA with ${state.name}`, async ({ page }) => {
      await page.setViewportSize(WIDE);
      await signIn(page, state.as ?? 'user');
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

/**
 * Text over gradients, on the surfaces that shipped unseen.
 *
 * `measureContrast` above skips any text whose background is an image, so the
 * band headers, the verb sheet and the marking report went unmeasured for a long
 * time, and white text on them read 1.9-2.8:1. These tests measure the same text
 * against every ground its paint can show, worst case, in both themes (the
 * arithmetic is in tests/e2e/support/gradientMath.ts and is unit-tested).
 *
 * The guard is strict and is NOT ratcheted: a failure fails the run. It found the
 * band headers' white labels, the Plus chip and the feedback highlights; those
 * are fixed, so it passes on main, and a regression in any of them fails here.
 *
 * What a green run does NOT show:
 *   - Bands 2-6. A header's ground follows the band of the question on screen,
 *     and the workspace opens on whichever question loads first, so these tests
 *     see one band. The ground for every band, in both themes, is pinned by
 *     tests/unit/cardHeaderWashContrast.test.ts, which reads the same table the
 *     app draws from. What it cannot see is a component that paints the header
 *     some other way, which is why the header itself is measured here too.
 *   - Anything not on the four surfaces below. The marking report is measured
 *     only through its feedback modal, in the feedback test.
 */

/** The surfaces the user's session reaches, measured in both themes. */
const SESSION_SURFACES: {
  name: string;
  /** Opens the surface on the workspace and returns its root. */
  reach: (page: Page) => Promise<Locator>;
}[] = [
  {
    // The writing card's header and the prompt card's header: both are
    // `CARD_HEADER_BOX` on the workspace.
    name: 'workspace card headers',
    reach: async (page) => page.locator('.rounded-t-surface-inner'),
  },
  { name: 'verb sheet', reach: openVerbSheet },
  { name: 'outcome brief', reach: openOutcomeBrief },
  {
    name: 'profile head',
    reach: async (page) => (await openProfile(page)).locator('header').first(),
  },
];

/** Measures one surface and returns its failing runs, as one message, or nothing. */
const gradientFailures = async (page: Page, name: string, theme: string, root: Locator) => {
  const report = await measureGradientContrast(root);
  // A run that measured nothing passes silently, and a run that never reached a
  // gradient proves nothing about gradients.
  if (report.readings.length <= 3) return `${name}, ${theme}: nothing was measured`;
  if (report.gradientReadings === 0) {
    return `${name}, ${theme}: no text was measured over a gradient, so the gradient path did not run`;
  }
  const failures = report.readings.filter((r) => r.ratio < r.floor);
  if (!failures.length) return null;
  return (
    `${name}, ${theme} theme: ${failures.length} of ${report.readings.length} run(s) fall below ` +
    `their floor over a gradient (${report.unassessed.length} could not be read)\n` +
    describeGradientReadings(failures)
  );
};

test.describe('text over gradients, the surfaces that shipped unseen', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'chromium desktop only'
  );

  test('text over gradients meets AA in both themes: the workspace and its sheets', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(WIDE);
    // One session for every surface: the outcome brief needs a question that
    // links outcomes, and the header, sheet and profile are fine on it too.
    await openWorkspaceQuestion(page, 'user', true);

    // Every failing run in both themes is collected before anything is asserted,
    // so one run reports all of them.
    const failing: string[] = [];
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      for (const surface of SESSION_SURFACES) {
        const root = await surface.reach(page);
        await page.waitForTimeout(800);
        await freezeAnimations(page);
        const problem = await gradientFailures(page, surface.name, theme, root);
        if (problem) failing.push(problem);
        await dismissAll(page);
      }
    }
    expect(failing, 'text below its floor over a gradient').toEqual([]);
  });

  test('text over gradients meets AA in both themes: the feedback modal', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(WIDE);
    await openWorkspaceQuestion(page, 'admin');

    const failing: string[] = [];
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      const root = await openFeedbackAfterMarking(page);
      await page.waitForTimeout(800);
      await freezeAnimations(page);
      const problem = await gradientFailures(page, 'feedback modal after marking', theme, root);
      if (problem) failing.push(problem);
      await dismissAll(page);
    }
    expect(failing, 'text below its floor over a gradient').toEqual([]);
  });
});
