import { test, expect } from '@playwright/test';
import { openWorkspace, openVerbRibbon, openPanel } from './support/workspace';
import { findClippedText, describeClipped } from './support/clipping';

/**
 * No words are cut off anywhere a student can see them.
 *
 * The narrow version of this has been written three times — once per surface
 * that lost its text — and each time it compared `scrollWidth` alone, which a
 * vertical clamp never trips. So this is the wide version: every element with
 * its own text, on both axes, at the widths the app is actually used at, in
 * both themes. `support/clipping` holds the rule, including what is allowed to
 * truncate (anything whose full string is still reachable from a `title` or an
 * `aria-label`) and what is not.
 *
 * It found five real losses the first time it ran, all of them a truncated
 * label with nothing anywhere carrying the rest: a breadcrumb whose tooltip
 * named the LEVEL rather than the crumb, the selected question in the
 * navigator bar, two combobox values and the exemplar count.
 */
test.describe('nothing is clipped without recourse', () => {
  test.describe.configure({ timeout: 240_000 });
  // The mobile projects land on the same 390 branch this walks to.
  test.skip(({ isMobile }) => !!isMobile, 'the widths are walked here in one run');

  test('across the workspace, at every width, in both themes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await openWorkspace(page);

    for (const theme of ['dark', 'light'] as const) {
      if (theme === 'light') {
        await page.getByRole('button', { name: /theme/i }).first().click();
        await page.waitForTimeout(700);
      }

      // 1440: a laptop. 900: the single-column fold. 390: a phone, where the
      // truncation this guards against actually bites.
      for (const width of [1440, 900, 390]) {
        await page.setViewportSize({ width, height: 1100 });
        await page.waitForTimeout(500);

        // Everything foldable, open: a panel that is shut cannot clip.
        await openVerbRibbon(page).catch(() => {});
        for (const name of [/grade standards/i, /marking guide/i, /syllabus terms/i, /strategy/i]) {
          await openPanel(page, name).catch(() => {});
        }
        await page.waitForTimeout(400);

        const clipped = await findClippedText(page);
        expect(
          clipped,
          `${theme} theme at ${width}px — ${clipped.length} element(s) cut off with no ` +
            `title or aria-label carrying the rest:\n${describeClipped(clipped)}`
        ).toEqual([]);
      }
    }
  });
});
