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

/**
 * Every tier-card header, with its name's real and visible line counts.
 *
 * Read from LAYOUT (`offsetTop`, `offsetHeight`), not from the screen. Each card is scaled by
 * its position in the strip (`.ribbon-tier-slot`), so the centred card and its neighbours
 * have different boxes on screen. The scale moves a card's box and not its layout, and the
 * question here is layout: whether the names, chips and subtitles sit on one line.
 */
const tierHeaders = (page: import('@playwright/test').Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-pressed]'))
      .filter((b) => /Band \d/.test(b.textContent || ''))
      .map((b) => {
        const button = b as HTMLElement;
        const name = b.querySelector('h4') as HTMLElement;
        const chip = b.querySelector('[class*="rounded-full"]') as HTMLElement | null;
        const subtitle = b.closest('.ribbon-tier-card')?.querySelector('p') as HTMLElement | null;
        const lineHeight = parseFloat(getComputedStyle(name).lineHeight);
        return {
          text: (name.textContent || '').trim(),
          needs: Math.round(name.scrollHeight / lineHeight),
          shows: Math.round(name.clientHeight / lineHeight),
          clippedSideways: name.scrollWidth > name.clientWidth + 1,
          headerHeight: button.offsetHeight,
          // Each offset is measured from its own containing box: the name and the chip from the
          // header, the subtitle from the card. Those are the rows the cards hang off.
          nameTop: name.offsetTop,
          chipTop: chip?.offsetTop ?? -1,
          subtitleTop: subtitle?.offsetTop ?? -1,
        };
      })
  );

test.describe('the verb ribbon’s tier cards', () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(({ isMobile }) => !!isMobile, 'the strip is measured once, at desk width');

  test('name every tier in full, and stand the six headers on one line', async ({ page }) => {
    // Wide enough that the strip is not the constraint. The failure this guards
    // against is about the CARD, not the viewport: a name that does not fit its own
    // header. The cards are a carousel, so most sit off screen at this width, and
    // they are measured all the same.
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

  // Headings and ceilings share a line across the six cards, and each header is a
  // control at least 44px tall. The rows are a two-row grid in the header, so the
  // names, the chips and the subtitles agree by construction; this confirms it in a
  // browser, where a line count or a font metric could still move them apart.
  test('stand every name, ceiling chip and subtitle on one line, and every header at least 44px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1150 });
    await openWorkspace(page);
    await openVerbRibbon(page);

    const headers = await tierHeaders(page);
    expect(headers.length, 'the six tier cards').toBe(6);

    for (const key of ['nameTop', 'chipTop', 'subtitleTop'] as const) {
      const tops = new Set(headers.map((h) => h[key]));
      expect(
        tops.size,
        `${key} differs across the cards: ${JSON.stringify(headers.map((h) => [h.text, h[key]]))}`
      ).toBe(1);
    }
    for (const h of headers) {
      expect(h.headerHeight, `"${h.text}" is a ${h.headerHeight}px control`).toBeGreaterThanOrEqual(
        44
      );
    }
  });

  // The banner is a filled band in BOTH themes: the tier's wash, the one the workspace
  // card headers wear, with white ink on it. The stage under it keeps its own palette:
  // a soft light sheet in the light theme (it was a near-black slab, which read as
  // abrasive beside the white panels) and the near-black spotlight in the dark. Contrast
  // alone cannot say whether a surface reads as the right kind of thing, so this reads
  // the computed colours as well.
  test('is a filled band in both themes, white ink on it, and the stage light in the light and dark in the dark', async ({
    page,
  }) => {
    await openWorkspace(page);
    await openVerbRibbon(page);

    // The banner and stage fade between themes (`transition-colors`). This test
    // asks what colour each theme *ends* on, not how it gets there, so take the
    // fade out. Desktop WebKit read the banner at alpha 0.04 on every retry: that
    // is the dark theme's hover wash (`dark:can-hover:hover:bg-white/[0.04]`,
    // left by the click that opened the ribbon), i.e. the fade's starting value,
    // so the frames that advance it were not being produced on a loaded runner
    // and no amount of waiting helps. Main runs 1180 and 1193 failed that way;
    // 1182 and 1186 passed.
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });

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
          bannerImage: getComputedStyle(toggle).backgroundImage,
          title: luminance(getComputedStyle(title).color),
          sublabel: luminance(getComputedStyle(sublabel).color),
          stage: luminance(getComputedStyle(root).backgroundColor),
          verb: luminance(getComputedStyle(verb).color),
          stat: luminance(getComputedStyle(stat).color),
        };
      });

    // The theme swap transitions colour on the banner and stage, so a read taken the
    // instant the attribute flips can catch a half-faded fill (WebKit did, once, on
    // main). Read until two consecutive reads agree.
    const readSettled = async () => {
      let previous = JSON.stringify(await read());
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await page.waitForTimeout(150);
        const current = JSON.stringify(await read());
        if (current === previous) break;
        previous = current;
      }
      return read();
    };

    // The same fill in both themes: a gradient over the band's dark ink step, so the
    // flat colour under it is what white must clear. White clears 4.5:1 on a ground at
    // or below relative luminance 0.183, so that is the line the banner is held to.
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(theme);
      const reading = await readSettled();
      expect(reading.bannerImage, `${theme}: the banner is not the band wash`).toContain(
        'linear-gradient'
      );
      expect(reading.banner!.alpha, `${theme}: the banner is see-through`).toBe(1);
      expect(
        reading.banner!.l,
        `${theme}: the banner's fill is too light for white ink (${reading.banner!.l.toFixed(3)})`
      ).toBeLessThanOrEqual(0.183);
      expect(reading.title!.l, `${theme}: the title is not white on the banner`).toBeGreaterThan(
        0.9
      );
      expect(reading.sublabel!.l, `${theme}: the sub-label is not white`).toBeGreaterThan(0.9);
    }

    await setTheme('light');
    const light = await readSettled();
    // The stage under the banner is a soft light ground, not the near-black slab, and
    // not pure white, or it would have no edge against the banner and the drawer.
    expect(light.stage!.l, 'the light stage is still dark').toBeGreaterThan(0.9);
    expect(light.stage!.l, 'the light stage is indistinguishable from white').toBeLessThan(1);
    // Dark ink on it, and a tier-coloured figure darker than the dark stage's.
    expect(light.verb!.l, 'the verb is not dark ink on the light stage').toBeLessThan(0.05);
    expect(light.stat!.l, 'the scoreboard figure is too light for a light ground').toBeLessThan(
      0.2
    );

    await setTheme('dark');
    const dark = await readSettled();
    // The dark stage is the near-black it always was, with white ink.
    expect(dark.stage!.l, 'the dark stage moved').toBeLessThan(0.02);
    expect(dark.verb!.l, 'the verb is not white on the dark stage').toBeGreaterThan(0.9);
    expect(dark.stat!.l, 'the figure is not a bright tier hue on the dark stage').toBeGreaterThan(
      light.stat!.l
    );
  });
});
