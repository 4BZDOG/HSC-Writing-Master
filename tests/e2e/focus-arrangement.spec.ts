import { test, expect, Page } from '@playwright/test';
import { openWorkspace } from './support/workspace';

/**
 * Focus Mode on a desktop: the student picks how the question and the writing
 * card share the window. Side by side, both cards must fit the window exactly
 * (that is the point of it), at whatever size the window happens to be, and
 * the choice must survive a reload.
 */

const cards = (page: Page) =>
  page.evaluate(() => {
    const box = (text: string) => {
      const h3 = Array.from(document.querySelectorAll('h3')).find((h) =>
        h.textContent?.includes(text)
      );
      const card = h3?.closest('[class*="rounded-surface"]');
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    return {
      prompt: box('Writing Prompt'),
      response: box('Written Response'),
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });

test.describe('Focus Mode arrangement', () => {
  test.skip(({ isMobile }) => !!isMobile, 'a phone has one column and no layout choice');

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    test(`side by side fits a ${size.width}x${size.height} window`, async ({ page }) => {
      await page.setViewportSize(size);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Focus mode' }).first().click();
      await page.getByRole('radio', { name: 'Side by side' }).click();

      await expect
        .poll(async () => {
          const c = await cards(page);
          // The page's padding eases for 500ms as Focus opens, so the cards are
          // read once they have come to rest inside the window.
          return (
            !!c.prompt &&
            !!c.response &&
            c.prompt.right <= c.response.left &&
            c.response.bottom <= c.viewport.height
          );
        })
        .toBe(true);

      const c = await cards(page);
      // Level with each other, and both wholly inside the window.
      expect(Math.abs(c.prompt!.top - c.response!.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(c.prompt!.bottom - c.response!.bottom)).toBeLessThanOrEqual(1);
      expect(c.prompt!.top).toBeGreaterThanOrEqual(0);
      expect(c.response!.bottom).toBeLessThanOrEqual(c.viewport.height);
      // And using the height, not floating in it.
      expect(c.response!.bottom - c.response!.top).toBeGreaterThan(c.viewport.height * 0.75);
    });
  }

  test('the splitter moves the columns and the choice is remembered', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Focus mode' }).first().click();
    await page.getByRole('radio', { name: 'Side by side' }).click();

    const bar = page.getByRole('separator', { name: /resize question and writing area/i });
    await expect(bar).toHaveAttribute('aria-orientation', 'vertical');
    const before = (await cards(page)).prompt!.right;
    await bar.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await cards(page)).prompt!.right).toBeLessThan(before - 40);

    expect(await page.evaluate(() => localStorage.getItem('hsc.focus.arrangement'))).toBe('side');

    // Too narrow for two columns: the stack returns without the student asking.
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect
      .poll(async () => {
        const c = await cards(page);
        return c.prompt!.bottom <= c.response!.top;
      })
      .toBe(true);
  });
});
