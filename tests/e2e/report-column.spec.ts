import { test, expect, Page } from '@playwright/test';
import { signIn, clearOnboarding, openFirstQuestion } from './support/workspace';

/**
 * The marking report is a document with a margin, not a column in an empty card.
 *
 * Bounding the column at `3xl` fixed a 142-character line and left ~400px of
 * nothing beside it on a desktop. From `xl` up the score placard and the metrics
 * move into that space and the prose narrows behind them. Below `xl` nothing
 * changes, and that half matters as much: the aside is the flex column's first
 * child there, so a student on a phone still meets the mark before the report.
 *
 * Geometry, not classes. What only a browser can say is whether the two columns
 * actually sit side by side, whether the prose got shorter, and whether anything
 * started clipping in a 352px margin — every one of which a unit test asserting
 * `xl:order-2` would happily miss.
 */

const FEEDBACK =
  'A sound response that identifies the main steps of replication but stops short of the ' +
  'detail a marker is looking for, particularly around the enzymes and the direction each ' +
  'strand is copied in, which is where the marks in this band are actually won.';

const MARKED = {
  overallMark: 3,
  overallBand: 4,
  overallFeedback: FEEDBACK,
  quickTip: 'Name the enzymes involved and say what each one does.',
  strengths: ['Correct sequence of steps.'],
  improvements: ['Add the role of each enzyme.'],
  criteria: [
    { criterion: 'Accuracy', mark: 2, maxMark: 2, feedback: 'Steps are correct.' },
    { criterion: 'Detail', mark: 1, maxMark: 2, feedback: 'Thin on specifics.' },
  ],
};

/** Column geometry, the prose measure, and anything overflowing its box. */
const layout = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('.EvaluationDisplay') as HTMLElement | null;
    const aside = root?.querySelector('aside') as HTMLElement | null;
    const main = aside?.parentElement?.querySelector(':scope > div') as HTMLElement | null;
    if (!root || !aside || !main) return null;

    const a = aside.getBoundingClientRect();
    const m = main.getBoundingClientRect();

    // Characters per line, from the element's own computed font rather than an
    // assumed average width — the interface face has changed once already.
    const prose = Array.from(root.querySelectorAll('p')).find(
      (p) => (p.textContent || '').length > 120,
    ) as HTMLElement | undefined;
    let chars: number | null = null;
    if (prose) {
      const probe = document.createElement('span');
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(prose).font}`;
      probe.textContent = 'abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz';
      document.body.appendChild(probe);
      chars = Math.round(prose.clientWidth / (probe.getBoundingClientRect().width / 53));
      probe.remove();
    }

    const clipped: string[] = [];
    root.querySelectorAll<HTMLElement>('*').forEach((el) => {
      if (!el.offsetParent) return;
      const ownText = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent || '').trim().length > 1,
      );
      if (!ownText) return;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') {
        clipped.push(`"${(el.textContent || '').trim().slice(0, 30)}"`);
      }
    });

    return {
      sideBySide: a.top < m.bottom && a.left >= m.right - 1,
      asideAbove: a.bottom <= m.top + 1,
      mainWidth: Math.round(m.width),
      asideWidth: Math.round(a.width),
      chars,
      docWidth: document.documentElement.scrollWidth,
      clipped: Array.from(new Set(clipped)),
    };
  });

test.describe('marking report column', () => {
  test.describe.configure({ timeout: 180_000 });
  // The mobile projects reach the same single-column branch as 390 below.
  test.skip(({ isMobile }) => !!isMobile, 'measured here across widths in one run');

  test('the score moves into the margin on wide screens, and nowhere else', async ({ page }) => {
    await page.route('**/api/gemini', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: JSON.stringify(MARKED),
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { totalTokenCount: 120 },
        }),
      }),
    );

    await page.setViewportSize({ width: 1440, height: 950 });
    await signIn(page);
    await clearOnboarding(page);
    await openFirstQuestion(page);
    await page
      .locator('textarea')
      .first()
      .fill(
        'DNA replication begins when the double helix unwinds. Each strand then acts as a ' +
          'template, and complementary bases are added along it to build two identical molecules.',
      );
    await page.getByRole('button', { name: /^Evaluate/ }).click();
    await page.getByText(FEEDBACK).waitFor({ timeout: 60_000 });

    // Below xl: one column, and the score is still above the report.
    for (const width of [390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(500);
      const l = await layout(page);
      expect(l, `no report at ${width}`).not.toBeNull();
      expect(l!.sideBySide, `${width}: should be one column`).toBe(false);
      expect(l!.asideAbove, `${width}: the mark should come before the report`).toBe(true);
      expect(l!.clipped, `${width}: clipped text`).toEqual([]);
      expect(l!.docWidth, `${width}: horizontal overflow`).toBeLessThanOrEqual(width);
    }

    // From xl: two columns, and the line is shorter for it.
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      await page.waitForTimeout(500);
      const l = await layout(page);
      expect(l!.sideBySide, `${width}: the aside should sit beside the report`).toBe(true);
      // The margin has to be wide enough for the placard's mark and the two
      // metric cards side by side; 352px (22rem) is what it was measured at.
      expect(l!.asideWidth, `${width}: margin too narrow`).toBeGreaterThanOrEqual(320);
      expect(l!.mainWidth, `${width}: reading column too wide`).toBeLessThanOrEqual(700);
      // 106 characters before the change, 86 after. The skill asks for 80; this
      // is the closest the layout reaches without a label losing its word.
      expect(l!.chars, `${width}: line too long`).toBeLessThanOrEqual(92);
      expect(l!.clipped, `${width}: clipped text`).toEqual([]);
      expect(l!.docWidth, `${width}: horizontal overflow`).toBeLessThanOrEqual(width);
    }
  });
});
