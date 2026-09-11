import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn, clearOnboarding, openFirstQuestion } from './support/workspace';

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

test.describe('accessibility (axe, WCAG 2.1 AA)', () => {
  test.describe.configure({ timeout: 120_000 });

  test.skip(({ browserName }) => browserName !== 'chromium', 'axe rules do not vary by engine');
  test.skip(({ isMobile }) => !!isMobile, 'measured once, at desktop width');

  test('the sign-in page has no violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#username', { timeout: 20_000 });

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

      const { violations, passes } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
      // A run that asserted nothing would pass silently — most likely because
      // the workspace never opened and axe scanned a spinner.
      expect(passes.length, `${theme}: axe checked almost nothing`).toBeGreaterThan(10);
      expect(violations, `workspace, ${theme} theme:${describeViolations(violations)}`).toEqual([]);
    }
  });
});
