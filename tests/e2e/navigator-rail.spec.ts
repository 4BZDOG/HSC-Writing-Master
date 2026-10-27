import { test, expect, Locator, Page } from '@playwright/test';
import { clearOnboarding, signIn } from './support/workspace';

/**
 * The syllabus navigator's progress rail: each step's dot sits on the line,
 * and both are on screen.
 *
 * They were not. Each dot was positioned twice, once by its wrapper and again
 * by itself, so at 1280px it sat about 36px left of the line, and on a phone it
 * sat wholly off the left edge of the screen (x -23 to -5), its tick with it,
 * while the line ran under the cards. Nothing failed, because the navigator's
 * wrapper bleeds into the page gutter on purpose so the dots are never clipped;
 * they were simply somewhere no one could see them. Geometry only a browser can
 * report, so it is measured here at two phone widths and a laptop's.
 */

/** A picker's trigger, by the placeholder it shows until something is chosen. */
const picker = (page: Page, placeholder: string): Locator =>
  page.locator('button[aria-haspopup="listbox"]', { hasText: placeholder });

/**
 * Takes the first option a picker offers, re-opening it while the import lands.
 * Does nothing when the step is already chosen (the app picks a course for an
 * account that has one).
 */
const pickFirst = async (page: Page, placeholder: string): Promise<void> => {
  const trigger = picker(page, placeholder).first();
  if (!(await trigger.count())) return;
  const option = page.getByRole('option').first();
  // Bounded at 30 s: WebKit settles these slowly on a loaded runner, and a
  // shorter bound fails a click that would have landed. The options come from
  // the curriculum import `clearOnboarding` has just started, so a list opened
  // before it finishes is empty; re-opening is what re-reads it.
  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click({ timeout: 30_000 }).catch(() => {});
    try {
      await option.waitFor({ state: 'visible', timeout: 5_000 });
      break;
    } catch {
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  await option.click({ timeout: 30_000 });
};

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 360, height: 780 },
  { width: 1280, height: 800 },
];

test.describe('the syllabus navigator rail', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const viewport of VIEWPORTS) {
    test(`every step dot is on screen and on the line at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signIn(page, 'user');
      await clearOnboarding(page);

      // A course and a topic, so the rail holds all three kinds of dot: done
      // (the course, with its tick), current (the topic) and the sub-topic
      // still to choose.
      await expect(page.locator('button[aria-haspopup="listbox"]').first()).toBeVisible({
        timeout: 30_000,
      });
      await pickFirst(page, 'Select course…');
      await expect(picker(page, 'Select topic…')).toBeVisible({ timeout: 30_000 });
      await pickFirst(page, 'Select topic…');
      await expect(picker(page, 'Select sub-topic…')).toBeVisible({ timeout: 30_000 });

      const stops = page.locator('[data-rail-stop] > *');
      await expect(stops).toHaveCount(3);
      // The dots ease between states over 500ms; measure them at rest.
      await page.waitForTimeout(700);

      const m = await page.evaluate(() => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        const line = document.querySelector('[data-rail-line]')!;
        const stopEls = Array.from(document.querySelectorAll('[data-rail-stop]'));
        return {
          line: box(line),
          dots: stopEls.map((s) => box(s.firstElementChild!)),
          ticks: stopEls
            .map((s) => s.querySelector('svg'))
            .flatMap((svg) => (svg ? [box(svg)] : [])),
          // The card each dot stands beside, to check the line runs between
          // them and is not hidden under them.
          cards: stopEls.map((s) => box(s.nextElementSibling!)),
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      const at = `at ${viewport.width}px`;
      const lineCentre = (m.line.left + m.line.right) / 2;

      expect(m.line.left, `the line on screen ${at}`).toBeGreaterThanOrEqual(0);
      expect(m.ticks, `the finished step's tick ${at}`).toHaveLength(1);

      m.dots.forEach((dot, i) => {
        const name = `dot ${i + 1} ${at}`;
        expect(dot.left, `${name} inside the left edge`).toBeGreaterThanOrEqual(0);
        expect(dot.right, `${name} inside the right edge`).toBeLessThanOrEqual(m.viewportWidth);
        expect((dot.left + dot.right) / 2, `${name} centred on the line`).toBeCloseTo(
          lineCentre,
          0
        );
        expect(dot.right, `${name} clear of its card`).toBeLessThanOrEqual(m.cards[i].left);
      });
      for (const tick of m.ticks) {
        expect(tick.left, `the tick on screen ${at}`).toBeGreaterThanOrEqual(0);
      }
      for (const card of m.cards) {
        expect(lineCentre, `the line beside the cards, not under them ${at}`).toBeLessThan(
          card.left
        );
      }
    });
  }
});
