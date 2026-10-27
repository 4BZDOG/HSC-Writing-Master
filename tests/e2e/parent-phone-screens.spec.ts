import { expect, Page, test, TestInfo } from '@playwright/test';
import { expectOnTop } from './support/paint';

/**
 * The parent and guardian screens at phone width, in the engines that CI runs on
 * a phone.
 *
 * These screens were only ever checked in Chromium at phone width. The Mobile
 * Safari leg is the one that runs real WebKit at iPhone 12 size, and it had never
 * looked at them. So this spec runs on the two mobile projects (Mobile Chrome and
 * Mobile Safari) and skips everywhere else. On each screen it checks three things:
 * the page does not scroll sideways, nothing visible lies past the phone's edge,
 * and the main heading and primary button are what is painted on top.
 *
 * It also attaches a full-page screenshot of each screen to the Playwright report.
 * Nothing here compares pixels. There are no baselines, because they differ per OS.
 * A person opens the `playwright-report-mobile-safari-*` artifact from CI and looks
 * at how WebKit actually drew them.
 *
 * Not covered, and why:
 * - The sign-up form with "I'm a parent or guardian" selected. The form only
 *   exists when Supabase is configured, and the Mobile Safari leg runs the mock
 *   server. The sign-in page is checked instead, since it is the same card.
 * - The student's "parent or guardian" link section. It is mounted in the profile
 *   modal, but only when `guardianAvailable()` is true, which also needs Supabase.
 *
 * The timeouts are generous on purpose. A cold dev server and a loaded WebKit
 * runner are both far slower than Chromium on a laptop.
 */

const SLOW = 60_000;

/** Signs in as the mock parent. Stops before the agreement gate is answered. */
const signInAsParent = async (page: Page) => {
  await page.goto('/');
  await page.fill('#username', 'parent');
  await page.fill('#password', 'parent');
  await page.click('button[type=submit]');
};

/**
 * Sideways overflow, checked two ways: the page as a whole, and each control and
 * heading on it. A control inside a container that scrolls sideways (the quick-start
 * tab row) may sit past the edge, because the reader reaches it by swiping that row.
 * Nothing else may.
 */
const expectFitsPhone = async (page: Page, screen: string) => {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(
    widths.scroll,
    `${screen}: the page scrolls sideways (${widths.scroll}px on a ${widths.viewport}px screen)`
  ).toBeLessThanOrEqual(widths.viewport + 1);

  const outside = await page.evaluate(() => {
    const inSidewaysScroller = (el: Element): boolean => {
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const { overflowX } = getComputedStyle(node);
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
      return false;
    };

    const found: string[] = [];
    document
      .querySelectorAll('button, a[href], input, select, textarea, h1, h2, h3, h4, h5, h6')
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (getComputedStyle(el).visibility === 'hidden') return;
        if (r.left >= -1 && r.right <= window.innerWidth + 1) return;
        if (inSidewaysScroller(el)) return;
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
        found.push(
          `<${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ''} spans ${Math.round(r.left)} to ${Math.round(r.right)}`
        );
      });
    return found;
  });
  expect(outside, `${screen}: controls or headings past the phone's width`).toEqual([]);
};

/** A full-page WebKit or Chromium render, for a person to look at in the CI report. */
const attachScreen = async (page: Page, testInfo: TestInfo, name: string) => {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
};

test.describe('parent and guardian screens at phone width', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phone layout only: runs on the Mobile projects.');
  test.describe.configure({ timeout: 180_000 });

  test('the sign-in page fits the phone and its heading and button are on top', async ({
    page,
  }, testInfo) => {
    await page.goto('/');

    const brand = page.getByRole('heading', { name: 'Band 6', level: 1 });
    const submit = page.locator('button[type=submit]');
    await expect(brand).toBeVisible({ timeout: SLOW });
    await expect(submit).toBeVisible({ timeout: SLOW });

    await expectOnTop(brand);
    await expectOnTop(submit);
    await expectFitsPhone(page, 'sign-in page');
    await attachScreen(page, testInfo, 'sign-in page');
  });

  test('the parent agreement gate fits the phone', async ({ page }, testInfo) => {
    await signInAsParent(page);

    // The gate is the only thing the app renders for a parent who has not accepted,
    // so it is what a parent sees first.
    const heading = page.getByRole('heading', {
      name: 'What you agree to as a parent or guardian',
    });
    const agree = page.getByRole('button', { name: /agree and continue/i });
    await expect(heading).toBeVisible({ timeout: SLOW });
    await expect(agree).toBeVisible({ timeout: SLOW });

    await expectOnTop(heading);
    await expectOnTop(agree);
    await expectFitsPhone(page, 'parent agreement gate');
    await attachScreen(page, testInfo, 'parent agreement gate');
  });

  test('the parent dashboard and quick-start guide fit the phone', async ({ page }, testInfo) => {
    await signInAsParent(page);

    // Accept the charter so the dashboard renders. The gate is scoped to its own
    // dialog, the same way the other specs reach past it.
    const agree = page.getByRole('button', { name: /agree and continue/i });
    const gate = page.getByRole('dialog').filter({ has: agree });
    await gate.getByRole('checkbox').first().check({ timeout: SLOW });
    await agree.click({ timeout: SLOW });

    const dashboard = page.getByRole('heading', { name: 'Your children', level: 1 });
    await expect(dashboard).toBeVisible({ timeout: SLOW });
    const offline = page.getByRole('region', {
      name: 'Parent accounts need an online account',
    });
    await expect(offline).toBeVisible({ timeout: SLOW });

    await expectOnTop(dashboard);
    await expectOnTop(page.getByRole('button', { name: 'Browse questions' }));
    await expectOnTop(offline);
    await expectFitsPhone(page, 'parent dashboard');
    await attachScreen(page, testInfo, 'parent dashboard');

    // The quick-start guide, from the dashboard's own button.
    await page.getByRole('button', { name: 'Quick start', exact: true }).click({ timeout: SLOW });

    const guideHeading = page.getByRole('heading', {
      name: 'Link your child in five steps',
      level: 2,
    });
    const guide = page.getByRole('dialog').filter({ has: guideHeading });
    await expect(guideHeading).toBeVisible({ timeout: SLOW });

    await expectOnTop(guideHeading);
    await expectOnTop(guide.getByRole('button', { name: 'Start writing' }));
    await expectFitsPhone(page, 'parent quick-start guide');
    await attachScreen(page, testInfo, 'parent quick-start guide');
  });
});
