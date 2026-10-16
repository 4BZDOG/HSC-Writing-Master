import { test, expect, type Page } from '@playwright/test';
import { openWorkspace, openVerbRibbon } from './support/workspace';

/**
 * The verb ribbon under a thumb.
 *
 * The ribbon was reported glitchy on an iPhone 15 in Safari, and nothing in the
 * suite could have said so: every other ribbon spec is desktop-only or reads the
 * page at rest. This one runs on the phone projects (Mobile Safari is real
 * WebKit, which is the point) and checks what a touch screen actually does —
 * that a tap moves the selection and the strip follows it, that nothing is left
 * stuck on afterwards, and that the ribbon is not wearing the things WebKit is
 * slow at.
 *
 * It cannot measure a frame. The unit tests pin which classes the ribbon wears;
 * what is asserted here is the part a browser has to answer.
 */

test.describe('the verb ribbon on a phone', () => {
  test.describe.configure({ timeout: 150_000 });
  test.skip(({ isMobile }) => !isMobile, 'a touch concern: runs on the phone projects');

  const strip = (page: Page) => page.getByRole('group', { name: /tier ladder/i });

  /** Which tier cell's halo is up, 1-based, or 0 when none is. */
  const litTier = (page: Page) =>
    page.evaluate(() => {
      const group = document.querySelector('[role="group"][aria-label*="tier ladder" i]');
      if (!group) return -1;
      const lit = Array.from(group.children).findIndex((cell) => {
        const halo = cell.lastElementChild as HTMLElement | null;
        return !!halo && parseFloat(getComputedStyle(halo).opacity) > 0.99;
      });
      return lit + 1;
    });

  test('a tap moves the selection, the strip follows it, and nothing is left stuck on', async ({
    page,
  }) => {
    await openWorkspace(page);
    await openVerbRibbon(page);

    // One halo, up, from the moment the ribbon is open.
    await expect.poll(() => litTier(page)).toBeGreaterThan(0);

    // A chip in the last tier: the farthest the strip has to travel.
    await strip(page).getByRole('button', { name: 'SYNTHESISE', exact: true }).tap();
    await expect.poll(() => litTier(page)).toBe(6);

    // …and the strip has carried that card into view, whichever way it got
    // there. Polled, because the glide is a smooth scroll.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const group = document.querySelector('[role="group"][aria-label*="tier ladder" i]')!;
            const card = group.children[5] as HTMLElement;
            const g = group.getBoundingClientRect();
            const c = card.getBoundingClientRect();
            return c.left >= g.left - 1 && c.right <= g.right + 1;
          }),
        { timeout: 5_000 }
      )
      .toBe(true);

    // The staircase is a second way in, and a larger target.
    await page.getByRole('button', { name: /^Show tier 2 verbs/ }).tap();
    await expect.poll(() => litTier(page)).toBe(2);
    // Anchored at both ends: the live region says "Tier 2 · Define & Describe · …"
    // in words for a screen reader, and only the chip is exactly this.
    await expect(page.getByText(/^Tier 2 · Define$/)).toBeVisible();

    // A phone cannot hover, and a tap must not leave a hover behind: the card
    // that was just tapped in must not be sitting at the desktop lift.
    const afterTap = await page.evaluate(() => {
      const group = document.querySelector('[role="group"][aria-label*="tier ladder" i]')!;
      const card = group.children[1].firstElementChild as HTMLElement;
      return {
        canHover: window.matchMedia('(hover: hover)').matches,
        transform: getComputedStyle(card).transform,
      };
    });
    expect(afterTap.canHover).toBe(false);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(afterTap.transform);

    // None of it widened the page: the strip scrolls inside itself.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('folds and unfolds, and the shut panel is out of reach', async ({ page }) => {
    await openWorkspace(page);
    await openVerbRibbon(page);

    const toggle = page.getByRole('button', { name: /command verb hierarchy reference/i }).first();
    const panelHeight = () =>
      page.evaluate(() => {
        const button = document.querySelector(
          'button[aria-label*="command verb hierarchy" i][aria-controls]'
        )!;
        const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
        return {
          height: Math.round(panel.getBoundingClientRect().height),
          inert: panel.hasAttribute('inert'),
        };
      });

    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await panelHeight()).height, { timeout: 5_000 }).toBe(0);
    expect((await panelHeight()).inert).toBe(true);

    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => (await panelHeight()).height, { timeout: 5_000 })
      .toBeGreaterThan(200);
    expect((await panelHeight()).inert).toBe(false);
    // The tier is still lit after a round trip.
    await expect.poll(() => litTier(page)).toBeGreaterThan(0);
  });

  test('wears none of what WebKit is slow at, and answers a tap without a zoom', async ({
    page,
  }) => {
    await openWorkspace(page);
    await openVerbRibbon(page);

    const found = await page.evaluate(() => {
      const frame = document
        .querySelector('[role="group"][aria-label*="tier ladder" i]')!
        .closest('.isolate')!.parentElement!;
      const maskOf = (el: Element) => {
        const style = getComputedStyle(el) as CSSStyleDeclaration & { webkitMaskImage?: string };
        return style.webkitMaskImage || style.maskImage || 'none';
      };
      const stage = frame.lastElementChild as HTMLElement;
      const group = stage.querySelector('[role="group"][aria-label*="tier ladder" i]')!;
      const everything = [stage, ...Array.from(stage.querySelectorAll('*'))];
      const chip = Array.from(stage.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'EXPLAIN'
      )!;
      return {
        // A mask on the stage, the strip or a card makes WebKit re-mask on every
        // frame of anything that moves under it.
        masked: everything.filter((el) => maskOf(el) !== 'none').length,
        // A blend mode renders everything beneath it offscreen, per frame.
        blended: everything.filter((el) => getComputedStyle(el).mixBlendMode !== 'normal').length,
        stripMask: maskOf(group),
        // Two taps in quick succession are a zoom unless this says otherwise.
        touchAction: {
          stage: getComputedStyle(stage).touchAction,
          chip: getComputedStyle(chip).touchAction,
        },
      };
    });
    expect(found.masked, 'something on the stage is masked').toBe(0);
    expect(found.blended, 'something on the stage is blended').toBe(0);
    expect(found.stripMask).toBe('none');
    expect(found.touchAction).toEqual({ stage: 'manipulation', chip: 'manipulation' });

    // Three taps back to back: the page is still the size it was.
    const before = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    for (const verb of ['DEFINE', 'ANALYSE', 'IDENTIFY']) {
      await strip(page).getByRole('button', { name: verb, exact: true }).tap();
    }
    const after = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    expect(after).toBe(before);
  });
});
