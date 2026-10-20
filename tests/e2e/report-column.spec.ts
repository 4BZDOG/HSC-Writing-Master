import { test, expect, Page } from '@playwright/test';
import { signIn, clearOnboarding, openFirstQuestion, EVALUATE_BUTTON } from './support/workspace';
import { findClippedText, describeClipped } from './support/clipping';

/**
 * The marking report fills the panel it sits in, at every width. It has no
 * reading measure: the text runs to the edge of its cards (DesignSpec §4,
 * "Measure", 2026-10-20). From `xl` up the score placard and the metrics still
 * move into a margin beside the reading column, so the report stays two columns,
 * and the prose takes whatever width the margin leaves. Below `xl` there is one
 * column, and the aside is the flex column's first child there, so a student on a
 * phone still meets the mark before the report.
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

/** Column geometry, and anything overflowing its box. */
/** The marking report itself — the clipping sweep is scoped to it here. */
const MAIN = '.EvaluationDisplay';

const layout = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('.EvaluationDisplay') as HTMLElement | null;
    // The mark (placard) and the reading column are marked by the report itself.
    const aside = root?.querySelector('[data-report="placard"]') as HTMLElement | null;
    const main = root?.querySelector('[data-report="reading"]') as HTMLElement | null;
    if (!root || !aside || !main) return null;

    const a = aside.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    const r = root.getBoundingClientRect();

    return {
      sideBySide: a.top < m.bottom && a.left >= m.right - 1,
      asideAbove: a.bottom <= m.top + 1,
      mainWidth: Math.round(m.width),
      asideWidth: Math.round(a.width),
      reportWidth: Math.round(r.width),
      reportRight: Math.round(r.right),
      asideRight: Math.round(a.right),
      docWidth: document.documentElement.scrollWidth,
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
      })
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
          'template, and complementary bases are added along it to build two identical molecules.'
      );
    await page.getByRole('button', { name: EVALUATE_BUTTON }).click();
    await page.getByText(FEEDBACK).waitFor({ timeout: 60_000 });

    // Below xl: one column, and the score is still above the report.
    for (const width of [390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(500);
      const l = await layout(page);
      expect(l, `no report at ${width}`).not.toBeNull();
      expect(l!.sideBySide, `${width}: should be one column`).toBe(false);
      expect(l!.asideAbove, `${width}: the mark should come before the report`).toBe(true);
      const clipped = await findClippedText(page, MAIN);
      expect(clipped, `${width}: clipped text\n${describeClipped(clipped)}`).toEqual([]);
      expect(l!.docWidth, `${width}: horizontal overflow`).toBeLessThanOrEqual(width);
    }

    // From xl: two columns, the margin beside the reading column, and the report filled.
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      await page.waitForTimeout(500);
      const l = await layout(page);
      expect(l!.sideBySide, `${width}: the aside should sit beside the report`).toBe(true);
      // The margin has to be wide enough for the placard's mark and the two
      // metric cards side by side; 352px (22rem) is what it was measured at.
      expect(l!.asideWidth, `${width}: margin too narrow`).toBeGreaterThanOrEqual(320);
      // The report fills its panel: the margin sits at the report's right edge,
      // and the reading column and the margin together, with the 2rem gap between
      // them (`xl:gap-x-8`), span the report's full width. No measure caps either.
      expect(
        Math.abs(l!.asideRight - l!.reportRight),
        `${width}: margin is not at the report's edge`
      ).toBeLessThanOrEqual(1);
      expect(
        l!.mainWidth + l!.asideWidth + 32,
        `${width}: reading column does not fill the report`
      ).toBeGreaterThanOrEqual(l!.reportWidth - 2);
      const clipped = await findClippedText(page, MAIN);
      expect(clipped, `${width}: clipped text\n${describeClipped(clipped)}`).toEqual([]);
      expect(l!.docWidth, `${width}: horizontal overflow`).toBeLessThanOrEqual(width);
      // The goal card sits under the placard at the column's own gap. With two auto
      // rows the reading column's height was shared between them, and a blank band
      // opened under the placard whenever the reading column was the taller — which
      // a real rewrite and commentary always make it. This stub's feedback is short,
      // so the reading column is stretched to stand in for them.
      const stackGap = await page.evaluate(() => {
        const reading = document.querySelector<HTMLElement>('[data-report="reading"]');
        const placard = document.querySelector('[data-report="placard"]');
        const figures = document.querySelector('[data-report="figures"]');
        if (!reading || !placard || !figures) return null;
        reading.style.minHeight = '1600px';
        const gap = figures.getBoundingClientRect().top - placard.getBoundingClientRect().bottom;
        reading.style.minHeight = '';
        return gap;
      });
      expect(stackGap, `${width}: right column not found`).not.toBeNull();
      expect(stackGap!, `${width}: gap under the placard`).toBeLessThanOrEqual(25);
    }
  });
});
