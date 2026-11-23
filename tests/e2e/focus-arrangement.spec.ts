import { test, expect, Page } from '@playwright/test';
import { clearOnboarding, openFirstQuestion, openWorkspace, signIn } from './support/workspace';

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

/**
 * The question card's own geometry: the card, its scrolling body, and the
 * question heading inside them. Used where the question has to be in view.
 */
const promptGeometry = (page: Page) =>
  page.evaluate(() => {
    const h3 = Array.from(document.querySelectorAll('h3')).find((h) =>
      h.textContent?.includes('Writing Prompt')
    );
    const card = h3?.closest('[class*="rounded-surface"]') as HTMLElement | null;
    const body = Array.from(card?.querySelectorAll('div') ?? []).find((d) =>
      d.className.includes('overflow-y-auto')
    );
    const h2 = card?.querySelector('h2');
    if (!card || !body || !h2) return null;
    const c = card.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    const q = h2.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      card: { top: c.top, bottom: c.bottom },
      body: { top: b.top, bottom: b.bottom, height: b.height },
      question: { top: q.top, bottom: q.bottom },
    };
  });

test.describe('Focus Mode question stays in view', () => {
  test('side by side, a lone question sits at the top of its card, not in the middle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // A question with no scenario is the case that used to be centred. A curator
    // clears the scenario in the normal workspace, then Focus Mode is entered.
    await signIn(page, 'admin');
    await clearOnboarding(page);
    await openFirstQuestion(page);
    const edit = page.getByRole('button', { name: 'Edit Scenario' });
    if (await edit.count()) {
      await edit.first().click();
      await page.getByLabel('Scenario text').fill('');
      await page.getByRole('button', { name: /Save Scenario/ }).click();
    }
    await page.getByRole('button', { name: 'Focus mode' }).first().click();
    await page.getByRole('radio', { name: 'Side by side' }).click();

    await expect
      .poll(async () => {
        const g = await promptGeometry(page);
        return !!g && g.card.bottom - g.card.top > 600;
      })
      .toBe(true);
    const g = (await promptGeometry(page))!;
    // The card is the window's height; a centred question would start near its middle.
    expect(g.question.top - g.card.top).toBeLessThan(160);
  });

  test('on a phone, Focus Mode opens with the question on screen, even if the scenario was left open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('hsc.focus.scenarioOpen', '1'));
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Focus mode' }).first().click();

    await expect
      .poll(async () => {
        const g = await promptGeometry(page);
        return !!g && g.question.top >= 0 && g.question.bottom <= g.viewport.height;
      })
      .toBe(true);
  });

  test('a question card dragged to its smallest height still shows the question', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => localStorage.setItem('hsc.focus.promptHeight', '150'));
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Focus mode' }).first().click();

    await expect
      .poll(async () => {
        const g = await promptGeometry(page);
        return !!g && g.body.height > 60;
      })
      .toBe(true);
    const g = (await promptGeometry(page))!;
    // The question is inside the card's visible body, not hidden behind the chrome.
    expect(g.question.top).toBeGreaterThanOrEqual(g.body.top);
    expect(g.question.bottom).toBeLessThanOrEqual(g.body.bottom + 1);
  });
});
