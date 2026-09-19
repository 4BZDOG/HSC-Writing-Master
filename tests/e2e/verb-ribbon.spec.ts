import { test, expect } from '@playwright/test';
import { openWorkspace, openVerbRibbon } from './support/workspace';

/**
 * The six tier cards in the command verb ribbon, and the one thing that keeps
 * going wrong with them: a name that does not fit.
 *
 * The names are what the six cards are told apart by. They have been
 * ellipsised three times — first by `truncate`, then by a two-line clamp
 * measured at 12px and kept when the line went to 14px. Each time the check
 * that should have caught it compared `scrollWidth`, which a VERTICAL clamp
 * never trips: the text fits its line and is cut off below it. So this
 * measures both axes.
 *
 * Geometry, not classes: the unit tests already pin which tokens the ribbon
 * wears. What only a browser can say is whether the words arrive whole, and
 * whether one long name pushes its own card's header out of line with the five
 * beside it.
 */

/** Every tier-card header, with its name's real and visible line counts. */
const tierHeaders = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-pressed]'))
      .filter((b) => /Band \d/.test(b.textContent || ''))
      .map((b) => {
        const name = b.querySelector('h4') as HTMLElement;
        const lineHeight = parseFloat(getComputedStyle(name).lineHeight);
        return {
          text: (name.textContent || '').trim(),
          needs: Math.round(name.scrollHeight / lineHeight),
          shows: Math.round(name.clientHeight / lineHeight),
          clippedSideways: name.scrollWidth > name.clientWidth + 1,
          headerHeight: Math.round(b.getBoundingClientRect().height),
        };
      })
  );

test.describe('the verb ribbon’s tier cards', () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(({ isMobile }) => !!isMobile, 'the strip is measured once, at desk width');

  test('name every tier in full, and stand the six headers on one line', async ({ page }) => {
    // Wide enough that the strip is not the constraint — each card is a fixed
    // 260px, so the failure this guards against is about the CARD, not the
    // viewport, and a wide window proves that.
    await page.setViewportSize({ width: 1920, height: 1150 });
    await openWorkspace(page);
    await openVerbRibbon(page);

    const headers = await tierHeaders(page);
    expect(headers.length, 'the six tier cards').toBe(6);

    for (const h of headers) {
      expect(h.clippedSideways, `"${h.text}" is cut off sideways`).toBe(false);
      expect(
        h.shows,
        `"${h.text}" needs ${h.needs} lines and the clamp shows ${h.shows} — ` +
          `the name is ellipsised, which is the one thing these cards are read by`
      ).toBeGreaterThanOrEqual(h.needs);
    }

    // One long name must not push its own header out of step with the rest:
    // the subtitle and every verb chip below it hang off this row.
    const heights = [...new Set(headers.map((h) => h.headerHeight))];
    expect(
      heights.length,
      `tier headers disagree on height: ${JSON.stringify(
        headers.map((h) => [h.text, h.headerHeight])
      )}`
    ).toBe(1);
  });
});
