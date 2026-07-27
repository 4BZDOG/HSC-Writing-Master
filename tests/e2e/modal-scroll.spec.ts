import { test, expect, Page } from '@playwright/test';

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

const signIn = async (page: Page) => {
  await page.goto('/');
  await page.fill('#username', 'user');
  await page.fill('#password', 'user');
  await page.click('button[type=submit]');
};

const clearOnboarding = async (page: Page) => {
  const agree = page.getByRole('button', { name: /agree and continue/i });
  await agree.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await agree.count()) {
    await page.getByRole('checkbox').first().check();
    await agree.click();
    await agree.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  }
  const guide = page.getByRole('button', { name: /start writing/i });
  await guide.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  await page.keyboard.press('Escape');
  await guide.waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {});
  const importButton = page.getByRole('button', { name: /import \d+ items?/i });
  await importButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await importButton.count()) {
    await importButton.first().click();
    await importButton.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }
};

const openFirstQuestion = async (page: Page) => {
  for (const placeholder of [
    'Select Course...',
    'Select Topic...',
    'Select Sub-Topic...',
    'Select Dot Point...',
    'Select Question...',
  ]) {
    const trigger = page.locator('button[aria-haspopup="listbox"]', { hasText: placeholder });
    if (!(await trigger.count())) continue;
    await trigger.first().click();
    const option = page.getByRole('option').first();
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    await option.click();
  }
  await expect(page.getByRole('heading', { name: /Writing Prompt/i })).toBeVisible({
    timeout: 20_000,
  });
};

test.describe('modal scrolling', () => {
  test.describe.configure({ timeout: 120_000 });

  // Wheel events are a pointer gesture; the mobile projects emulate touch, where
  // `mouse.wheel` is not a thing. The lock itself is browser-agnostic (see the
  // useScrollLock unit tests) — this asserts it end to end on the desktop
  // projects, which is where the bug was reported.
  test.skip(({ isMobile }) => !!isMobile, 'wheel gestures need a pointer');

  test('the wheel never moves the page behind an open dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await signIn(page);
    await clearOnboarding(page);
    await openFirstQuestion(page);

    // Somewhere for the background to drift to.
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    // Clicked through the DOM rather than with the pointer: an actionability
    // click scrolls its target into view first, which would move the page
    // before the dialog ever opened.
    await page.evaluate(() =>
      (document.querySelector('[title="View Verb Definition"]') as HTMLElement)?.click()
    );
    await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(400);

    // Locked, and pinned at the offset the student was reading from.
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
    expect(await page.evaluate(() => document.body.style.top)).toBe(`-${before}px`);

    // A wheel over the dialog's chrome — not one of its scrollable regions.
    await page.mouse.move(700, 120);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.body.style.top)).toBe(`-${before}px`);

    // Closing restores the page, at the place it was left.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});
