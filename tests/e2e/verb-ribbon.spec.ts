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

  // The ribbon was dark in both themes: a dark banner, then a near-black stage,
  // between a white page and a white drawer. The banner was fixed first; the stage
  // was a 440px slab of the page's darkest colour and read as abrasive in the light
  // theme. It now has a soft light palette there — and the dark theme is exactly
  // what it was. Contrast alone cannot say either: `light-theme.spec.ts` warns that
  // "a header that reads as a dark slab beside its light twin has fine contrast and
  // is still wrong", so this reads the computed colours.
  test('is light in the light theme, banner and stage both, and dark in the dark', async ({
    page,
  }) => {
    await openWorkspace(page);
    await openVerbRibbon(page);

    const setTheme = async (theme: 'light' | 'dark') => {
      const toggle = page.getByRole('button', {
        name: new RegExp(`switch to ${theme} theme`, 'i'),
      });
      if (await toggle.count()) {
        await toggle.first().click();
        // The theme swap animates the surfaces it touches.
        await page.waitForTimeout(800);
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme')))
        .toBe(theme === 'light' ? 'light' : null);
    };

    const read = () =>
      page.evaluate(() => {
        const luminance = (css: string) => {
          const m = css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
          if (!m) return null;
          const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
            const c = Number(v) / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          });
          return {
            l: 0.2126 * r + 0.7152 * g + 0.0722 * b,
            alpha: m[4] === undefined ? 1 : Number(m[4]),
          };
        };
        const toggle = document.querySelector(
          'button[aria-label*="command verb hierarchy" i][aria-controls]'
        ) as HTMLElement;
        const root = toggle.closest('.isolate') as HTMLElement;
        const title = Array.from(toggle.querySelectorAll('h3')).find((h) =>
          /Command Verb Hierarchy/i.test(h.textContent || '')
        ) as HTMLElement;
        const sublabel = title.nextElementSibling as HTMLElement;
        const verb = Array.from(root.querySelectorAll('h4')).find((h) =>
          h.className.includes('t-display')
        ) as HTMLElement;
        const stat = Array.from(root.querySelectorAll('span')).find((el) =>
          el.className.includes('font-mono')
        ) as HTMLElement;
        return {
          banner: luminance(getComputedStyle(toggle).backgroundColor),
          title: luminance(getComputedStyle(title).color),
          sublabel: luminance(getComputedStyle(sublabel).color),
          stage: luminance(getComputedStyle(root).backgroundColor),
          verb: luminance(getComputedStyle(verb).color),
          stat: luminance(getComputedStyle(stat).color),
        };
      });

    await setTheme('light');
    const light = await read();
    // A light bar: opaque and near white, with dark ink on it.
    expect(light.banner!.alpha, 'the light banner is see-through').toBe(1);
    expect(light.banner!.l, 'the light banner is not light').toBeGreaterThan(0.8);
    expect(light.title!.l, 'the title is not dark ink on it').toBeLessThan(0.1);
    expect(light.sublabel!.l, 'the sub-label is not dark ink on it').toBeLessThan(0.25);
    // The stage under it is a soft light ground, no longer the near-black slab —
    // and not pure white, or it would have no edge against the banner and the drawer.
    expect(light.stage!.l, 'the light stage is still dark').toBeGreaterThan(0.9);
    expect(light.stage!.l, 'the light stage is indistinguishable from white').toBeLessThan(1);
    // Dark ink on it, and a tier-coloured figure darker than the dark stage's.
    expect(light.verb!.l, 'the verb is not dark ink on the light stage').toBeLessThan(0.05);
    expect(light.stat!.l, 'the scoreboard figure is too light for a light ground').toBeLessThan(
      0.2
    );

    await setTheme('dark');
    const dark = await read();
    // The dark banner is the stage itself, seen through: transparent, white ink.
    expect(dark.banner!.alpha, 'the dark banner is a fill, not the stage').toBeLessThan(0.05);
    expect(dark.title!.l, 'the title is not white on the dark banner').toBeGreaterThan(0.9);
    expect(dark.sublabel!.l).toBeGreaterThan(0.5);
    // The dark stage is the near-black it always was, with white ink.
    expect(dark.stage!.l, 'the dark stage moved').toBeLessThan(0.02);
    expect(dark.verb!.l, 'the verb is not white on the dark stage').toBeGreaterThan(0.9);
    expect(dark.stat!.l, 'the figure is not a bright tier hue on the dark stage').toBeGreaterThan(
      light.stat!.l
    );
  });
});
