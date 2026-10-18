import { test, expect, Page } from '@playwright/test';
import { openWorkspace, openQuestionWithOutcomes } from './support/workspace';

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
      // The bar docked in the corner: stat pills on the question, writing tools
      // on the response. Marked `data-card-bar` because the question card's corner
      // holds a second thing now (the reading size, above the bar), so "the
      // first child of the corner" is no longer the bar.
      const bar = header.querySelector('[data-card-bar]') as HTMLElement | null;
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
   * The question card's footer used to be one nowrap row with a scrolling chip
   * strip in the middle. In two columns the card is ~490px, the strip was left a
   * few pixels, and the second outcome chip was clipped to "S…" with no
   * scrollbar. The chips wrap now, and the reading size left for the heading's
   * corner. Geometry again, because only a browser can say where a wrapped chip
   * lands.
   */
  test('the question footer never clips a chip, and the reading size has its own corner', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await openWorkspace(page);
    await openQuestionWithOutcomes(page);

    // 1600 and 1440 and 1280 are the two-column widths (1280 is the card at its
    // narrowest); 1024 is the single column; 390 is a phone.
    for (const width of [1600, 1440, 1280, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(700);

      const m = await page.evaluate(() => {
        const h3 = Array.from(document.querySelectorAll('h3')).find((h) =>
          h.textContent?.includes('Writing Prompt')
        ) as HTMLElement;
        const card = h3.closest('[class*="rounded-surface"]') as HTMLElement;
        const header = h3.closest('[class*="rounded-t-"]') as HTMLElement;
        const footer = card.querySelector('[class*="rounded-b-"]') as HTMLElement;
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, h: r.height };
        };
        const zoom = header.querySelector('[role="group"][aria-label="Reading size"]')!;
        const bar = header.querySelector('[data-card-bar]')!;
        const verbChip = header.querySelector('button[aria-label^="Open the command verb guide"]');
        const buttons = Array.from(footer.querySelectorAll('button'));
        return {
          card: box(card),
          header: box(header),
          zoom: box(zoom),
          bar: box(bar),
          heading: box(h3),
          verbChip: verbChip ? box(verbChip) : null,
          zoomButtons: Array.from(zoom.querySelectorAll('button')).map((b) => box(b).h),
          footerButtons: buttons.map((b) => ({
            name: b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '',
            ...box(b),
            // Text that overflows its own box is text cut off.
            clipped: b.scrollWidth > b.clientWidth + 1,
          })),
          // Nothing in the footer is a scroller, so nothing in it can be hidden.
          footerScrolls: [footer, ...Array.from(footer.querySelectorAll('*'))].some(
            (el) =>
              el.scrollWidth > el.clientWidth + 1 &&
              /(auto|scroll|hidden)/.test(getComputedStyle(el).overflowX) &&
              el.clientWidth > 0
          ),
        };
      });
      const at = `at ${width}px`;
      const overlaps = (
        a: { left: number; right: number; top: number; bottom: number },
        b: typeof a
      ) =>
        a.left < b.right - 1 &&
        a.right > b.left + 1 &&
        a.top < b.bottom - 1 &&
        a.bottom > b.top + 1;

      // Every chip is whole and inside the card.
      expect(m.footerButtons.length, `footer has chips ${at}`).toBeGreaterThanOrEqual(3);
      for (const b of m.footerButtons) {
        expect(b.left, `${b.name} inside the card's left edge ${at}`).toBeGreaterThanOrEqual(
          m.card.left
        );
        expect(b.right, `${b.name} inside the card's right edge ${at}`).toBeLessThanOrEqual(
          m.card.right
        );
        expect(b.clipped, `${b.name} text not cut off ${at}`).toBe(false);
      }
      expect(m.footerScrolls, `no hidden overflow in the footer ${at}`).toBe(false);

      // The reading size is in the heading's top-right corner: inside the header,
      // against its right edge, above the stat bar, clear of the title and verb.
      expect(m.zoom.top, `reading size inside the header ${at}`).toBeGreaterThanOrEqual(
        m.header.top
      );
      expect(m.zoom.bottom).toBeLessThanOrEqual(m.header.bottom);
      expect(overlaps(m.zoom, m.bar), `reading size clear of the stat bar ${at}`).toBe(false);
      expect(overlaps(m.zoom, m.heading), `reading size clear of the title ${at}`).toBe(false);
      if (m.verbChip) {
        expect(overlaps(m.zoom, m.verbChip), `reading size clear of the verb ${at}`).toBe(false);
      }
      if (width >= 640) {
        // Above the bar and level with its right edge, in the corner.
        expect(m.zoom.bottom, `reading size above the bar ${at}`).toBeLessThanOrEqual(m.bar.top);
        expect(Math.abs(m.zoom.right - m.bar.right)).toBeLessThanOrEqual(1);
      } else {
        // A phone's touch targets are 44px: the reading size's buttons and the
        // footer's own.
        for (const h of m.zoomButtons) expect(h).toBeGreaterThanOrEqual(44);
        for (const b of m.footerButtons)
          expect(b.h, `${b.name} 44px ${at}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  /**
   * The floor under a one-line question. It exists so a short question still
   * leaves somewhere to write; set too high it holds the pair in a card far
   * taller than anything in it — which is what 620 was doing once the chrome
   * shrank. The empty writing surface must also not scroll: a scrollbar with
   * nothing to scroll to is the failure the floor guards against.
   *
   * The ceiling is 600 (it was 520, over a measured 517). The prompt card's footer
   * is two rows now, the actions and then the outcome chips in an even grid, which
   * costs a question with an outcome 33px, for a footer that no longer strands the
   * flag or leaves a ragged right edge. Which question opens first also depends on
   * the order the course library lands (measured here: 526 to 578 across the
   * questions that can be first), so the margin has to cover the longest of them.
   * 600 is still under the 620 that was the complaint.
   */
  // On a phone the question's verb, marks and band share one line under the title,
  // and the writing card's verb shares one with "How to answer". Both were laid out
  // in grid cells that could meet: "IDENTIFY" ran under the marks bar and under the
  // button at 320px, and "CRITICALLY EVALUATE" under the bar at 390px. Every control
  // in those lines must stay clear of the others, whatever the verb.
  for (const width of [320, 360, 390]) {
    test(`a phone's header lines never overlap at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openWorkspace(page);
      await page.waitForTimeout(700);

      const m = await page.evaluate(() => {
        const box = (el: Element | Range) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width };
        };
        const h3 = Array.from(document.querySelectorAll('h3')).find((h) =>
          h.textContent?.includes('Writing Prompt')
        ) as HTMLElement;
        const header = h3.closest('[class*="rounded-t-"]') as HTMLElement;
        const verb = header.querySelector('button[aria-label^="Open the command verb guide"]')!;
        const meta = verb.parentElement!;
        // Everything drawn on the verb's line, the heading, the reading size and the
        // stat bar (hidden on a phone, where its stats are on the verb's line).
        const pieces = [
          ...Array.from(meta.children),
          h3,
          header.querySelector('[role="group"][aria-label="Reading size"]')!,
          header.querySelector('[data-card-bar]')!,
        ]
          .map((el) => ({ name: (el.textContent ?? '').trim(), ...box(el) }))
          .filter((b) => b.w > 0);
        const how = Array.from(document.querySelectorAll('button')).find(
          (b) => b.getAttribute('aria-controls') && /How to answer/.test(b.textContent ?? '')
        )!;
        // The verb's TEXT, not its box: the box is its grid column's width, and the
        // word ran out of it and under the button without the box moving.
        const range = document.createRange();
        range.selectNodeContents(how.parentElement!.querySelector('span.t-label')!);
        return { header: box(header), pieces, how: box(how), term: box(range) };
      });
      const at = `at ${width}px`;
      const overlaps = (
        a: { left: number; right: number; top: number; bottom: number },
        b: typeof a
      ) =>
        a.left < b.right - 1 &&
        a.right > b.left + 1 &&
        a.top < b.bottom - 1 &&
        a.bottom > b.top + 1;

      for (let i = 0; i < m.pieces.length; i += 1) {
        const a = m.pieces[i];
        expect(a.right, `${a.name} inside the header ${at}`).toBeLessThanOrEqual(m.header.right);
        for (const b of m.pieces.slice(i + 1)) {
          expect(overlaps(a, b), `${a.name} clear of ${b.name} ${at}`).toBe(false);
        }
      }
      expect(overlaps(m.term, m.how), `the verb clear of How to answer ${at}`).toBe(false);
    });
  }

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
    expect(card.height!).toBeLessThanOrEqual(600);
    expect(card.scrolls, 'an empty writing surface must not scroll').toBe(false);
  });

  /**
   * Dragging the window's bottom edge up past the question. Below the height
   * where the question fits, both cards are held at a cap taken from the
   * window. The cap used to reach them through a resize listener and an
   * effect, two renders after the resize, so every step of the drag painted
   * the pair at the previous step's height before correcting it: the bottom of
   * the cards shuddered against the bottom of the window. The first layout
   * after a resize must already be the final one.
   */
  test('the pair follows a window drag in the same frame once it reaches the cap', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openWorkspace(page);
    await page.waitForTimeout(900);

    const heights = () =>
      page.evaluate(async () => {
        const card = (text: string) => {
          const h3 = Array.from(document.querySelectorAll('h3')).find((h) =>
            h.textContent?.includes(text)
          );
          const box = h3?.closest('[class*="rounded-surface"]') as HTMLElement | null;
          return box ? Math.round(box.getBoundingClientRect().height) : null;
        };
        const read = () => ({ prompt: card('Writing Prompt'), response: card('Written Response') });
        const first = read();
        for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
        return { first, settled: read() };
      });

    const open = await heights();
    expect(open.settled.prompt).not.toBeNull();
    // Shrink until the cap is well below the question, a few pixels at a time.
    const capped = (open.settled.prompt ?? 0) + 180 - 60;
    for (let h = capped + 40; h >= capped; h -= 8) {
      await page.setViewportSize({ width: 1440, height: h });
      const { first, settled } = await heights();
      expect(first, `the first frame is the final one at ${h}px`).toEqual(settled);
      expect(settled.response, `the writing area matches the question at ${h}px`).toBe(
        settled.prompt
      );
    }
    const last = await heights();
    expect(last.settled.prompt!, 'the question is held at the cap').toBeLessThan(
      open.settled.prompt!
    );
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

/**
 * One column reads in the order a student works: the syllabus terms to weave in,
 * then the marking guide that says what earns the marks, and the exemplars last,
 * past everything a student reads while writing. The exemplars sit under the
 * writing card only when the cards are side by side (Workspace's
 * `exemplarsAtBottom`), so this is checked below the two-column breakpoint and
 * on a phone, where a regression would put a finished answer ahead of the
 * reference material it should follow.
 */
test.describe('the reference panels in one column', () => {
  test.describe.configure({ timeout: 120_000 });

  const PANELS = ['Syllabus terms', 'Marking guide', 'Sample answers'] as const;

  for (const width of [1024, 390]) {
    test(`read Syllabus terms, Marking guide, Sample answers at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await openWorkspace(page);
      await openQuestionWithOutcomes(page);
      await page.waitForTimeout(700);

      const tops = await page.evaluate(
        (names) => {
          // Each panel's header is the button that opens it, named by its title.
          const top = (name: string) => {
            const btn = Array.from(document.querySelectorAll('button')).find((b) =>
              (b.textContent ?? '').trim().startsWith(name)
            );
            return btn ? btn.getBoundingClientRect().top + window.scrollY : null;
          };
          return names.map((n) => ({ name: n, top: top(n) }));
        },
        PANELS as unknown as string[]
      );

      for (const { name, top } of tops) expect(top, `${name} is on the page`).not.toBeNull();
      const order = [...tops].sort((a, b) => (a.top as number) - (b.top as number));
      expect(order.map((t) => t.name)).toEqual([...PANELS]);
    });
  }

  // Focus Mode folds the left rail away, so the three panels ride under the writing
  // card instead. The Syllabus terms were the one it left out, which on a phone
  // meant writing with no list of the terms the marker rewards.
  for (const width of [1280, 390]) {
    test(`Focus Mode keeps all three, in the same order, at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await openWorkspace(page);
      await page
        // The toggle keeps one name and says its state in aria-pressed.
        .getByRole('button', { name: 'Focus mode', exact: true, pressed: false })
        .first()
        .click();
      await page.waitForTimeout(900);

      const names = await page.evaluate(
        (wanted) => {
          const found = wanted.map((name) => {
            const btn = Array.from(document.querySelectorAll('button[aria-expanded]')).find((b) =>
              (b.textContent ?? '').trim().startsWith(name)
            );
            return { name, top: btn ? btn.getBoundingClientRect().top + window.scrollY : null };
          });
          return found;
        },
        PANELS as unknown as string[]
      );

      for (const { name, top } of names) expect(top, `${name} is on the page`).not.toBeNull();
      const order = [...names].sort((a, b) => (a.top as number) - (b.top as number));
      expect(order.map((t) => t.name)).toEqual([...PANELS]);
    });
  }
});
