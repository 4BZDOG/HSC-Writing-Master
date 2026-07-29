import { test, expect, Page } from '@playwright/test';
import { signIn, clearOnboarding, openFirstQuestion } from './support/workspace';

/**
 * The page holds still behind a modal.
 *
 * Reported from a classroom: scrolling inside the manual question generator
 * moved the workspace behind it instead of the dialog's own content. Every
 * modal in this app is a `fixed inset-0` layer over a document that scrolls
 * itself, so a wheel gesture anywhere that was not a scrollable part of the
 * dialog — the header, the padding, a settled form — went straight through.
 *
 * The guard is deliberately generic: it drives one modal, but what it asserts
 * is the shared `useScrollLock` contract that every modal now goes through.
 */

test.describe('modal scrolling', () => {
  test.describe.configure({ timeout: 120_000 });

  // The mobile projects emulate touch and lay the workspace out differently;
  // the lock itself is engine-level, and desktop WebKit covers the same engine
  // Mobile Safari runs.
  test.skip(({ isMobile }) => !!isMobile, 'covered by the desktop projects');

  test('the wheel never moves the page behind an open dialog', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signIn(page);
    await clearOnboarding(page);
    await openFirstQuestion(page);

    // Scrolled programmatically, not with the wheel: WebKit's driver does not
    // deliver synthetic wheel events to the page, and this step is only setup.
    // It doubles as the check that the page scrolls AT ALL — the root element
    // carries `overflow-x: clip` (index.css) precisely so it does, and this is
    // the assertion that would catch that going wrong in an engine where
    // `clip` behaves differently.
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => window.scrollY);
    expect(before, 'the page must scroll before we can test that it stops').toBeGreaterThan(0);

    // Clicked through the DOM rather than with the pointer: an actionability
    // click scrolls its target into view first, which would move the page
    // before the dialog ever opened.
    await page.evaluate(() =>
      (
        document.querySelector('[aria-label^="Open the command verb guide"]') as HTMLElement
      )?.click()
    );
    await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(400);

    // Locked, and pinned at the offset the student was reading from.
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    expect(await page.evaluate(() => document.body.style.top)).toBe(`-${before}px`);

    // A wheel over the dialog's chrome — not one of its scrollable regions.
    // This is the gesture the bug was reported for, and the only part of the
    // test that needs a real pointer: mobile projects emulate touch, and
    // WebKit's driver swallows synthetic wheels, so both are left to assert
    // the lock's state (above and below) rather than the gesture.
    if (browserName !== 'webkit') {
      await page.mouse.move(700, 120);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.body.style.top)).toBe(`-${before}px`);
    }

    // Closing restores the page, at the place it was left.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});
