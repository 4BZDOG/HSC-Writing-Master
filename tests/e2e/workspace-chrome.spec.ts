import { test, expect, Page } from '@playwright/test';
import { openWorkspace } from './support/workspace';

/**
 * The two workspace cards read as a pair, and stay that way.
 *
 * This one has come back from user testing three times: "Writing Prompt" and
 * "Written Response" drifting a few pixels apart, the headers ballooning with
 * empty space, the chrome disagreeing across the gap. Each round it was
 * verified by hand at one window size and the measurement thrown away — which
 * is exactly why it kept coming back. Every invariant that was checked by hand
 * is checked here instead, at three widths, so the next change to either
 * header has to keep the promise or fail.
 *
 * Geometry, not classes: the unit tests already assert both headers are built
 * from the same constants (workspacePanelChrome). What only a browser can say
 * is where the pixels actually land once flexbox, wrapping and the cross-card
 * height sync have had their say.
 */

/** Both headers' geometry, and the bar docked in each bottom-right corner. */
const chrome = (page: Page) =>
  page.evaluate(() => {
    const heading = (text: string) =>
      Array.from(document.querySelectorAll('h3')).find((h) => h.textContent?.includes(text));
    const round = (n: number) => Math.round(n);

    const read = (text: string) => {
      const h3 = heading(text);
      const header = h3?.closest('[class*="rounded-t-"]') as HTMLElement | null;
      if (!h3 || !header) return null;
      // The tray is the only `self-stretch` box in the header; the bar is what
      // it holds — stat pills on the question, writing tools on the response.
      const bar = header.querySelector('div[class*="self-stretch"] > div') as HTMLElement | null;
      return {
        headerHeight: round(header.getBoundingClientRect().height),
        headingTop: round(h3.getBoundingClientRect().top),
        barTop: bar ? round(bar.getBoundingClientRect().top) : null,
        barHeight: bar ? round(bar.getBoundingClientRect().height) : null,
      };
    };

    return { prompt: read('Writing Prompt'), response: read('Written Response') };
  });

/** How tall a header may be before it is carrying empty space again. */
const HEADER_CEILING = 96;

test.describe('workspace card chrome', () => {
  test.describe.configure({ timeout: 120_000 });

  // The mobile projects stack the cards and suppress the cross-card sync
  // entirely, which is a different contract — see the single-column test.
  test.skip(({ isMobile }) => !!isMobile, 'the pair is only a pair side by side');

  test('the two headers stay a matched pair at every width', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openWorkspace(page);

    // 1600: comfortable. 1440: the width a 15" laptop actually runs at. 1280:
    // the two-column breakpoint itself, where the question card is narrowest
    // and its header has least room before it wraps.
    //
    // 1360 and 1359 are the two sides of the heading's own step (see
    // CARD_HEADER_TITLE): above it the heading takes 24px, below it 20px,
    // because 24px is where the response card's corner bar stops fitting
    // beside the heading and drops to its own line — while the question
    // card's, being narrower, stays up. That is exactly the 44px split this
    // test caught when the step was first set at `sm`, so both sides of it
    // are measured rather than the safe one alone.
    for (const width of [1600, 1440, 1360, 1359, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      // The height sync settles over a frame or two; give it several.
      await page.waitForTimeout(700);

      const { prompt, response } = await chrome(page);
      const at = `at ${width}px`;

      expect(prompt, `question card header missing ${at}`).not.toBeNull();
      expect(response, `writing card header missing ${at}`).not.toBeNull();
      if (!prompt || !response) continue;

      // The headings sit on the same line. This is the one that keeps coming
      // back, and 1px of tolerance is for fractional layout, not for drift.
      expect(
        Math.abs(prompt.headingTop - response.headingTop),
        `headings level ${at}`
      ).toBeLessThanOrEqual(1);

      // The bar docked in each bottom-right corner is the pair's clearest
      // signal: same line, same height, across the gap.
      expect(prompt.barTop, `question card has a corner bar ${at}`).not.toBeNull();
      expect(response.barTop, `writing card has a corner bar ${at}`).not.toBeNull();
      expect(
        Math.abs((prompt.barTop ?? 0) - (response.barTop ?? 0)),
        `corner bars level ${at}`
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((prompt.barHeight ?? 0) - (response.barHeight ?? 0)),
        `corner bars same height ${at}`
      ).toBeLessThanOrEqual(1);

      // Same height as each other, and neither carrying a slab of empty
      // colour. 129px was the state user testing reported as "lots of empty
      // space"; the rebuilt headers measure 82.
      expect(
        Math.abs(prompt.headerHeight - response.headerHeight),
        `headers same height ${at}`
      ).toBeLessThanOrEqual(1);
      expect(prompt.headerHeight, `question header not generous ${at}`).toBeLessThanOrEqual(
        HEADER_CEILING
      );
      expect(response.headerHeight, `writing header not generous ${at}`).toBeLessThanOrEqual(
        HEADER_CEILING
      );
    }
  });

  /**
   * Zooming shrinks the viewport in CSS pixels, which is the case that broke
   * every previous fix: the offset between the two headings moved with the
   * zoom level, because each was centred against a different content height.
   */
  test('zooming in keeps the headings level, then drops to one column', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openWorkspace(page);

    // 110% and 125% of a 1600px window, still above the 1280 breakpoint.
    for (const width of [1454, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(700);
      const { prompt, response } = await chrome(page);
      expect(prompt && response).toBeTruthy();
      expect(Math.abs((prompt?.headingTop ?? 0) - (response?.headingTop ?? 0))).toBeLessThanOrEqual(
        1
      );
    }

    // Past the breakpoint the cards stack, and the pair stops being a pair:
    // the writing card sits below the question rather than beside it.
    await page.setViewportSize({ width: 1150, height: 1000 });
    await page.waitForTimeout(700);
    const stacked = await chrome(page);
    expect(stacked.response!.headingTop).toBeGreaterThan(stacked.prompt!.headingTop + 100);
  });

  /**
   * The floor under a one-line question. It exists so a short question still
   * leaves somewhere to write; set too high it holds the pair in a card far
   * taller than anything in it — which is what 620 was doing once the chrome
   * shrank. The empty writing surface must also not scroll: a scrollbar with
   * nothing to scroll to is the failure the floor guards against.
   */
  test('a one-line question does not open a screenful of empty card', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openWorkspace(page);
    await page.waitForTimeout(900);

    const card = await page.evaluate(() => {
      const h3 = Array.from(document.querySelectorAll('h3')).find((h) =>
        h.textContent?.includes('Written Response')
      );
      // The card shell's radius token (DesignSpec §3). It was written here as
      // the literal `rounded-[32px]` until that value was given a role name.
      const box = h3?.closest('[class*="rounded-surface"]') as HTMLElement | null;
      const body = box?.querySelector('[class*="overflow-y-auto"]') as HTMLElement | null;
      return {
        height: box ? Math.round(box.getBoundingClientRect().height) : null,
        scrolls: body ? body.scrollHeight > body.clientHeight + 1 : null,
      };
    });

    expect(card.height).not.toBeNull();
    expect(card.height!).toBeLessThanOrEqual(520);
    expect(card.scrolls, 'an empty writing surface must not scroll').toBe(false);
  });

  /**
   * A response is only worth marking if the student wrote it, so the writing
   * surface refuses pasted text — and the exemplars offer a student no
   * one-click route around it.
   */
  test('a student cannot paste a response in, or load one from the exemplars', async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openWorkspace(page);

    const surface = page.locator('textarea').first();
    await surface.click();
    await surface.type('My own opening sentence.');

    // The real gesture rather than a synthetic event — what has to hold is
    // that the BROWSER's own paste is refused. Chromium only: the other
    // engines' drivers do not grant clipboard access to a page under test, and
    // a paste that never reaches the page proves nothing. Same reasoning as
    // the wheel gesture in modal-scroll.spec.
    if (browserName === 'chromium') {
      await page.evaluate(() =>
        navigator.clipboard.writeText('A borrowed Band 6 paragraph.').catch(() => {})
      );
      await page.keyboard.press('ControlOrMeta+v');

      // Scoped by the guard's OWN wording, not by a phrase from its body.
      // `status` is a shared role on this page — the API health indicator is
      // one, and so is the verb ribbon's cue line — so a filter on prose from
      // the banner's second paragraph is a strict-mode violation waiting to
      // happen. "Pasting is switched off" is the banner's heading and
      // identifies it.
      //
      // This comment used to name the collision precisely: the ribbon's tier-2
      // subtitle ends "in your own words". It was already wrong when it was
      // written — that subtitle sat OUTSIDE the cue's `role="status"` span, so
      // the region never contained the phrase — and the footer has since
      // dropped the subtitle altogether in favour of a threshold clause. The
      // reason for the filter survives the correction, which is why it stays:
      // `getByRole('status')` still matches more than one node on this page.
      const pasteGuard = page.getByRole('status').filter({ hasText: /Pasting is switched off/i });
      await expect(pasteGuard).toBeVisible();
      await expect(pasteGuard).toContainText(/own words/i);
      await expect(surface).toHaveValue('My own opening sentence.');
    }

    // And the exemplars offer reading, not loading.
    const exemplars = page.getByRole('button', { name: /Sample Answers/i });
    if (await exemplars.count()) {
      await exemplars.first().click();
      await page.waitForTimeout(400);
      await expect(page.getByRole('button', { name: /^Use$/ })).toHaveCount(0);
    }
  });
});

/**
 * The live writing stats open from their whole header row, and the controls on
 * that row stay their own.
 *
 * jsdom cannot say which element a press lands on, so this asks the browser:
 * a press on the clock must reach the disclosure, a press on Pause must not
 * open the panel, and the Terms & Structure pill must still open it. The
 * disclosure is a button laid over the row as a sibling of the timer, so this
 * is the check that the overlay sits where it is meant to.
 */
test.describe('the live writing stats disclosure', () => {
  test.describe.configure({ timeout: 120_000 });
  test.skip(({ isMobile }) => !!isMobile, 'the hit-test is taken once, at desk width');

  test('a press on the clock opens it, and Pause does not', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openWorkspace(page);

    const disclosure = page.getByRole('button', { name: /writing metrics/i });
    const timer = page.getByRole('timer').first();
    await timer.scrollIntoViewIfNeeded();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    const centre = async (locator: typeof timer) => {
      const box = await locator.boundingBox();
      return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    };
    const hitAt = (point: { x: number; y: number }) =>
      page.evaluate(
        ({ x, y }) =>
          (document.elementFromPoint(x, y) as HTMLElement | null)
            ?.closest('button')
            ?.getAttribute('aria-label') ?? null,
        point
      );

    // The clock is not a button of its own, and what lies under it is the disclosure.
    const clockPoint = await centre(timer);
    expect(await hitAt(clockPoint), 'a press on the clock does not reach the disclosure').toMatch(
      /writing metrics/i
    );
    await page.mouse.click(clockPoint.x, clockPoint.y);
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

    // Shut it from the word count, then press Pause: the panel stays shut.
    const words = page.getByText(/words of about/i).first();
    const wordsBox = await words.boundingBox();
    await page.mouse.click(wordsBox!.x + 5, wordsBox!.y + wordsBox!.height / 2);
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    const pause = page.getByRole('button', { name: /pause timer|start timer/i }).first();
    expect(await hitAt(await centre(pause)), 'Pause is covered by the disclosure').not.toMatch(
      /writing metrics/i
    );
    await pause.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    // The pill is the visible label of the same disclosure, so it still opens it.
    const pillPoint = await centre(page.getByText('Terms & Structure').first());
    await page.mouse.click(pillPoint.x, pillPoint.y);
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  });
});
