import { test, expect, type Page } from '@playwright/test';
import { signIn, clearOnboarding, openFirstQuestion } from './support/workspace';

/**
 * The paywall's WIRING, as opposed to its logic.
 *
 * The rules are covered thoroughly by unit tests. What they could not catch is
 * the defect that prompted this spec: the School seat purchase was correct,
 * configured and tested, and unreachable — it lived inside a prompt that only
 * opens on a locked control, shown only to the two roles that never have one.
 * Every piece passed its own test; nothing asked whether a person could get to
 * it. That is the question here.
 *
 * Runs against the default mock-mode dev server, so no Stripe price IDs are
 * configured. The School route therefore lands on its enquiry branch — which
 * is the point: the assertion is that a route EXISTS for the role, not which
 * of its two forms it takes (the unit tests pin that).
 */

/**
 * The app's entrance animations never settle inside Playwright's stability
 * check — the amber CTA carries `transition-all` under a modal that fades and
 * lifts in, so a plain click waits out the full timeout. `index.css` already
 * neutralises every animation and transition under `prefers-reduced-motion`,
 * so asking for it is both the fix and a pass over that path.
 *
 * Applied per page rather than through `test.use`, which the suite's own
 * type-check rejects on the base `test` object.
 */
const withoutMotion = async (page: Page): Promise<void> => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
};

// Every test here signs in, clears onboarding and walks into the app before it
// asserts anything, which on webkit at a phone width does not fit the default
// 30s. The repo gives its other full-journey specs the same room —
// `agreement-gate` 60s, `evaluation-flow` 90s, `quota` and `accessibility`
// 120s.
test.describe.configure({ timeout: 90_000 });

/**
 * Profile → Settings → Compare plans, which is where the plan table lives.
 * Three clicks deep, which is itself worth knowing: this is the only route to
 * it, and it is the route the School licence panel had to be put on.
 */
const openPlanComparison = async (page: Page) => {
  await page.getByRole('button', { name: /open your profile/i }).click();
  // Wait for the dialog before reaching into it, and scroll the tab into view
  // before clicking: the tab row is an `overflow-x-auto` scroller, and at a
  // phone width "Settings" is its last item, so on webkit the click spent its
  // whole timeout waiting for an element that was never quite in position.
  await page.getByRole('dialog', { name: /your profile/i }).waitFor({ state: 'visible' });
  const settings = page.getByRole('button', { name: /^Settings$/ });
  await settings.scrollIntoViewIfNeeded();
  await settings.click();
  const compare = page.getByRole('button', { name: /compare plans/i }).first();
  await compare.scrollIntoViewIfNeeded();
  await compare.click();
  // A tagline, not a plan name: the profile card names plans too.
  await expect(page.getByText(/One licence covering every student and teacher/i)).toBeVisible({
    timeout: 15_000,
  });
};

test.describe('the profile hands off rather than stacking', () => {
  test('“Compare plans” actually changes the screen', async ({ page }) => {
    // It did not. `activeModals` is a Set, so the profile stayed open at
    // `z-profile` (2000) over a plan table at `z-quickstart` (940) — the user
    // pressed the row and nothing visible happened. `toBeVisible` does not
    // model occlusion, so only a click could catch it: the buried CTA reported
    // "element intercepts pointer events" from the profile's own subtree.
    await withoutMotion(page);
    await signIn(page, 'user');
    await clearOnboarding(page);
    await openPlanComparison(page);
    await expect(page.getByRole('dialog', { name: /your profile/i })).toHaveCount(0);
  });
});

test.describe('a modal can be closed by its close button', () => {
  /**
   * Both of these were dead, and no unit test could have caught either: the
   * button rendered, had its name and its handler, and was in the tree. It was
   * simply covered. The header's content wrapper is `relative z-10`, the close
   * button sat at `z-10` (the guide) or at no z-index at all (the prompt), and
   * the wrapper comes later in the DOM — so it won and swallowed every click.
   *
   * The upgrade prompt's X was covered at EVERY width. The guide's only at a
   * phone width, where the headline wraps and the block grows under it.
   *
   * These two are the suite's only genuine clicks on a modal's X, and that is
   * deliberate: an occluded control is exactly what `.click()` catches and
   * nothing else does. They are also the only place that cost has to be paid,
   * which is why `clearOnboarding` fires the handler directly instead.
   *
   * Neither click carries a short budget any more. Both did, and on Mobile
   * Safari both spent it inside Playwright's "visible, enabled and stable"
   * wait without ever reaching the hit test — the same click that Chromium
   * settles in about 100ms. A short budget on WebKit does not prove the button
   * is covered; it proves the runner was busy. The describe block's own 90s
   * timeout is the budget, and a button that is genuinely covered still fails
   * on "intercepts pointer events" long before it.
   */
  test('the upgrade prompt closes from its X, at both widths', async ({ page }) => {
    await withoutMotion(page);
    await signIn(page, 'user');
    await clearOnboarding(page);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent('writing-studio:upgrade-request', {
            detail: { feature: 'fullFeedback' },
          })
        )
      );
      const prompt = page.getByRole('dialog', { name: /full marking feedback/i });
      await prompt.waitFor({ state: 'visible', timeout: 20_000 });
      await prompt.getByRole('button', { name: /^close$/i }).click();
      await expect(prompt).toHaveCount(0);
    }
  });

  test('the quick-start guide closes from its X on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await withoutMotion(page);
    await signIn(page, 'user');
    // Deliberately NOT clearOnboarding — the guide is the subject here.
    const agree = page.getByRole('button', { name: /agree and continue/i });
    await agree.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    if (await agree.count()) {
      // Scoped to the gate's own dialog — the first-run syllabus import
      // renders eight checkboxes of its own behind it.
      const gate = page.getByRole('dialog').filter({ has: agree });
      await gate.getByRole('checkbox').first().check();
      await agree.click();
    }
    const guide = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('button', { name: /getting started/i }) });
    await guide.waitFor({ state: 'visible', timeout: 20_000 });
    // Let first run finish before measuring the X. The guide opens at the
    // busiest moment the app has — the bundled curriculum is being discovered
    // behind it — and the prompt offering that curriculum is the signal that
    // the work is done. Clicking into the middle of it was measuring the
    // runner, not the button.
    await page
      .getByRole('button', { name: /add \d+ syllabus(es)?/i })
      .waitFor({ state: 'attached', timeout: 30_000 })
      .catch(() => {});
    await guide.getByRole('button', { name: /^close$/i }).click();
    await expect(guide).toHaveCount(0);
  });
});

test.describe('the free tier can see what it is held to', () => {
  test('states the remaining markings as text, not as a tooltip', async ({ page }) => {
    // A `title` attribute is not a limit anyone on a phone can plan around,
    // and most students are on one.
    await withoutMotion(page);
    await signIn(page, 'user');
    await clearOnboarding(page);
    await openFirstQuestion(page);
    const counter = page.getByTestId('free-eval-counter');
    await expect(counter).toBeVisible({ timeout: 20_000 });
    await expect(counter).toContainText(/\d+\/\d+ left/);
  });

  test('names the plan and a price in the comparison, not just a list of crosses', async ({
    page,
  }) => {
    await withoutMotion(page);
    await signIn(page, 'user');
    await clearOnboarding(page);
    await openPlanComparison(page);
    await expect(page.getByText(/Your plan/i).first()).toBeVisible();
    // The School column carries a price, so it has to carry a way to act on it.
    await expect(page.getByText(/Ask about a school licence/i).first()).toBeVisible();
  });

  test('offers an upgrade route from the comparison', async ({ page }) => {
    await withoutMotion(page);
    await signIn(page, 'user');
    await clearOnboarding(page);
    await openPlanComparison(page);
    await page.getByRole('button', { name: /See Band 6 Plus/i }).click();
    await expect(page.getByRole('dialog', { name: /Full Marking Feedback/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe('staff can reach the School licence', () => {
  test('a teacher finds a route to it, despite never meeting a lock', async ({ page }) => {
    // The regression this spec exists for. A teacher holds Plus through the
    // staff perk, so no control is ever locked for them and the upgrade prompt
    // — which is where the seat picker used to live, alone — cannot open. The
    // route has to be somewhere they actually go.
    await withoutMotion(page);
    await signIn(page, 'teacher');
    await clearOnboarding(page);
    await openPlanComparison(page);
    // The ROUTE, not any text mentioning a licence. `/school licence/i` also
    // matches the comparison table's own row note — which is `hidden sm:block`,
    // so on a phone this asserted a hidden element and failed on Mobile Safari
    // while passing everywhere the table is drawn.
    await expect(page.getByRole('button', { name: /ask about a school licence/i })).toBeVisible();
  });

  test('a teacher is not shown a free-tier marking limit', async ({ page }) => {
    await withoutMotion(page);
    await signIn(page, 'teacher');
    await clearOnboarding(page);
    await openFirstQuestion(page);
    await expect(page.getByTestId('free-eval-counter')).toHaveCount(0);
  });
});

test.describe('an unlocked account sees no paywall', () => {
  test('an admin is metered by nothing and sold nothing', async ({ page }) => {
    await withoutMotion(page);
    await signIn(page, 'admin');
    await clearOnboarding(page);
    await openFirstQuestion(page);
    await expect(page.getByTestId('free-eval-counter')).toHaveCount(0);
    await openPlanComparison(page);
    // Nothing to upgrade to: the CTA is for free-plan accounts only.
    await expect(page.getByRole('button', { name: /See Band 6 Plus/i })).toHaveCount(0);
  });
});
