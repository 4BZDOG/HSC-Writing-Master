import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn, clearOnboarding, openFirstQuestion, openVerbRibbon } from './support/workspace';
import { freezeAnimations, measureContrast, describeReadings } from './support/contrast';

/**
 * WCAG 2.1 AA, by machine, on the two surfaces every user passes through.
 *
 * This does NOT replace the contrast sweep in light-theme.spec.ts, and the two
 * are deliberately complementary. That one measures text on flat, near-grey
 * surfaces and says explicitly why it stops there: brand-coloured chrome is "a
 * design decision to take once, not a light-theme oversight to gate on here".
 * Axe covers the rest of the rulebook — accessible names, roles, form labels,
 * heading order, keyboard reachability — which nothing here was checking.
 *
 * It earned its place immediately. On the workspace it found two `serious`
 * violations that had shipped:
 *
 *   - `color-contrast`: the band-2 chip, white on `bg-orange-600`, 3.56:1
 *     against a 4.5:1 floor. Fixed at the source in utils/renderUtils.ts and
 *     now pinned for every band, in both themes, by bandColors.test.ts — which
 *     is where a palette decision belongs, since a unit test can check all six
 *     bands without having to render a question that happens to be band 2.
 *   - `scrollable-region-focusable`: the outcome-chip strip in PromptDisplay
 *     was a scroller even with no chips in it, so "No specific outcomes
 *     linked." sat 153px wide inside 102px, with `scrollbar-hide` removing the
 *     scrollbar and nothing focusable inside to tab to.
 *
 * …and a third once the sweep was pointed at the modals, which is where most
 * of this app lives:
 *
 *   - `scrollable-region-focusable` again, on the quick start guide's body —
 *     the panel every new account reads first, which a keyboard user could not
 *     scroll because its tabs and buttons sit outside the scroller.
 *
 * Chromium only, and not on mobile widths: axe's rules are engine-independent,
 * so a second engine re-reports the same findings for twice the CI minutes.
 * Same reasoning, and the same `test.skip` pattern, as light-theme.spec.ts.
 *
 * A NEW violation here is a real defect, not a reason to relax the sweep. If
 * one is genuinely not worth fixing, exclude that rule BY NAME with a comment
 * saying why — never widen the tag list or drop the assertion.
 */

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Violations, flattened to something a person can act on from CI logs alone. */
const describeViolations = (
  violations: Array<{
    id: string;
    impact?: string | null;
    help: string;
    nodes: Array<{ html: string; target: unknown[] }>;
  }>
): string =>
  violations
    .map(
      (v) =>
        `\n  [${v.impact ?? 'unknown'}] ${v.id} — ${v.help}\n` +
        v.nodes
          .slice(0, 5)
          .map((n) => `      ${String(n.target.join(' '))}\n        ${n.html.slice(0, 160)}`)
          .join('\n')
    )
    .join('');

/**
 * WCAG 1.4.10 Reflow, which axe cannot check and which the rest of the suite
 * is structurally blind to.
 *
 * The Evaluate button — the only way to have an answer marked — sat outside the
 * viewport at every width below 640px. At 390px, an iPhone 12, a student who
 * had written an answer could not see it: the footer row was `flex` with no
 * wrap, so its right end ran past the card, and every ancestor was
 * `overflow: hidden`. Programmatic scrolling reaches such a container; a finger
 * does not.
 *
 * Nothing caught it, and could not have. `evaluation-flow.spec.ts` clicks that
 * button on Mobile Safari and passes, because Playwright's `click()` scrolls
 * the element into view first — auto-scroll makes a test pass on a control no
 * user could reach. So this measures GEOMETRY and never clicks: the box must
 * already be inside the viewport, untouched.
 */
test.describe('reflow — the primary action is reachable at phone widths', () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(({ browserName }) => browserName !== 'chromium', 'layout, not engine, is the subject');
  test.skip(({ isMobile }) => !!isMobile, 'the viewport is set explicitly below');

  // 320 is the width WCAG 1.4.10 names, and what a 640px window gives at 200%
  // zoom; 390 is an iPhone 12. 375 is the SE, the narrowest mainstream phone.
  for (const width of [320, 375, 390]) {
    test(`Evaluate is fully within the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await signIn(page);
      await clearOnboarding(page);
      await openFirstQuestion(page);

      // Write something, so the button is in its live state rather than disabled.
      const editor = page.locator('[contenteditable="true"], textarea').first();
      if (await editor.count()) {
        await editor.click();
        await page.keyboard.type('A test answer.');
      }
      await page.waitForTimeout(600);

      const box = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const button = [...document.querySelectorAll('button')].find((b) =>
          /Evaluate your response|Write a response first/.test(b.getAttribute('title') ?? '')
        );
        if (!button) return null;
        const rect = button.getBoundingClientRect();
        return { vw, left: Math.round(rect.left), right: Math.round(rect.right) };
      });

      expect(box, 'the Evaluate button was not rendered at all').not.toBeNull();
      expect(
        box!.right,
        `Evaluate runs ${box!.right - box!.vw}px past the right edge at ${width}px — ` +
          `a touch user cannot reach it, because every ancestor clips rather than scrolls`
      ).toBeLessThanOrEqual(box!.vw);
      expect(box!.left, `Evaluate starts off the left edge at ${width}px`).toBeGreaterThanOrEqual(
        0
      );
    });
  }
});

/**
 * Text on BRAND-COLOURED fills — the set light-theme.spec.ts leaves alone.
 *
 * That sweep measures only text on flat, near-grey surfaces, and its reason is
 * sound: it exists to catch a tone tuned against black and reused on white, and
 * chrome that is deliberately the same colour in both themes is "a design
 * decision to take once, not a light-theme oversight to gate on here".
 *
 * But "take it once" is not "never check it", and nothing was checking it. Two
 * failures had shipped inside that gap: the band 2 and band 4 solid fills
 * (fixed at source, and now pinned per-band in bandColors.test.ts), and the
 * header avatar, white on `bg-indigo-500` at 4.47:1 — under the floor by 0.03,
 * and the one indigo in the app that had drifted off the `-600` every other
 * button rests on.
 *
 * So this holds the brand-coloured readings to their floor in absolute terms,
 * which is a different question from the parity that sweep asks, and does not
 * disturb its scope.
 */
test.describe('brand-coloured text meets its contrast floor', () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(({ browserName }) => browserName !== 'chromium', 'colour, not engine, is the subject');
  test.skip(({ isMobile }) => !!isMobile, 'measured once, at desktop width');

  test('in both themes', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signIn(page);
    await clearOnboarding(page);
    await openFirstQuestion(page);
    // Shut, the verb ribbon is invisible to a checker that walks text nodes,
    // and it is most of the brand-coloured chrome there is: 3 readings without
    // it against 11 with — which the count assertion below turned into a
    // failure rather than a quiet pass. light-theme.spec.ts opens it for the
    // same reason. It survives the theme switches below, so once is enough.
    await openVerbRibbon(page);

    for (const theme of ['dark', 'light'] as const) {
      const toggle = page.getByRole('button', {
        name: new RegExp(`switch to ${theme} theme`, 'i'),
      });
      if (await toggle.count()) {
        await toggle.first().click();
        await page.waitForTimeout(800);
      }
      await freezeAnimations(page);

      const { readings } = await measureContrast(page);
      const brand = readings.filter((r) => !r.neutralBackground);
      // A run that measured no brand chrome at all would pass having proved
      // nothing — most likely because the workspace never opened.
      expect(brand.length, `${theme}: no brand-coloured text was measured`).toBeGreaterThan(5);

      const failures = brand.filter((r) => r.ratio < r.floor);
      expect(
        failures,
        `${theme} theme: ${failures.length} of ${brand.length} brand-coloured readings ` +
          `fall below their floor\n${describeReadings(failures)}`
      ).toEqual([]);
    }
  });
});

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.skip(({ browserName }) => browserName !== 'chromium', 'axe rules do not vary by engine');
  test.skip(({ isMobile }) => !!isMobile, 'measured once, at desktop width');

  test('the sign-in page has no violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#username', { timeout: 20_000 });
    // Mid-animation is not a state that ships. Without this the sign-in scan
    // passed alone and failed under parallel load, catching a transitional
    // opacity as a contrast violation — the same reason light-theme.spec.ts
    // freezes before it measures.
    await freezeAnimations(page);
    await page.waitForTimeout(400);

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(violations, `sign-in page:${describeViolations(violations)}`).toEqual([]);
  });

  test('the modals a student opens have no violations', async ({ page }) => {
    // This app is mostly modals, so a sweep of the workspace alone would miss
    // most of it. The quick start guide is the one every new account meets
    // first, and it was the third `serious` finding: its body scrolls, the
    // "Getting started" tab has nothing interactive in it, and the tabs and
    // footer buttons sit OUTSIDE the scroller — so a keyboard user could reach
    // everything around the guide and never scroll the guide.
    await signIn(page);
    await clearOnboarding(page);
    await openFirstQuestion(page);

    const surfaces: Array<[string, RegExp]> = [
      ['quick start guide', /quick start guide/i],
      ['user profile', /open your profile/i],
    ];

    for (const [label, trigger] of surfaces) {
      await page.getByRole('button', { name: trigger }).first().click();
      await page.waitForTimeout(1500);
      await freezeAnimations(page);

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
      expect(violations, `${label}:${describeViolations(violations)}`).toEqual([]);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }
  });

  test('the workspace has no violations, in both themes', async ({ page }) => {
    // Deliberately the project's own viewport, not a widened one. An earlier
    // draft forced 1400px and went green over the very defect that prompted
    // this file: the outcome strip only overflows once the card is narrow
    // enough, so the extra width hid it. A sweep that quietly picks a
    // comfortable layout tests the layout, not the app.
    await signIn(page);
    await clearOnboarding(page);
    await openFirstQuestion(page);

    for (const theme of ['dark', 'light'] as const) {
      const toggle = page.getByRole('button', {
        name: new RegExp(`switch to ${theme} theme`, 'i'),
      });
      if (await toggle.count()) {
        await toggle.first().click();
        await page.waitForTimeout(800);
      }
      await freezeAnimations(page);

      const { violations, passes } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
      // A run that asserted nothing would pass silently — most likely because
      // the workspace never opened and axe scanned a spinner.
      expect(passes.length, `${theme}: axe checked almost nothing`).toBeGreaterThan(10);
      expect(violations, `workspace, ${theme} theme:${describeViolations(violations)}`).toEqual([]);
    }
  });
});
