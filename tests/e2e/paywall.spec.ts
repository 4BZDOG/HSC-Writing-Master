import { test, expect } from '@playwright/test';
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
 */
test.use({ reducedMotion: 'reduce' });

/**
 * Profile → Settings → Compare plans, which is where the plan table lives.
 * Three clicks deep, which is itself worth knowing: this is the only route to
 * it, and it is the route the School licence panel had to be put on.
 */
const openPlanComparison = async (page: import('@playwright/test').Page) => {
  await page.getByRole('button', { name: /open your profile/i }).click();
  await page.getByRole('button', { name: /^Settings$/ }).click();
  await page.getByRole('button', { name: /compare plans/i }).first().click();
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
    await signIn(page, 'user');
    await clearOnboarding(page);
    await openPlanComparison(page);
    await expect(page.getByRole('dialog', { name: /your profile/i })).toHaveCount(0);
  });
});

test.describe('the free tier can see what it is held to', () => {
  test('states the remaining markings as text, not as a tooltip', async ({ page }) => {
    // A `title` attribute is not a limit anyone on a phone can plan around,
    // and most students are on one.
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
    await signIn(page, 'user');
    await clearOnboarding(page);
    await openPlanComparison(page);
    await expect(page.getByText(/Your plan/i).first()).toBeVisible();
    // The School column carries a price, so it has to carry a way to act on it.
    await expect(page.getByText(/Ask about a school licence/i).first()).toBeVisible();
  });

  test('offers an upgrade route from the comparison', async ({ page }) => {
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
    await signIn(page, 'teacher');
    await clearOnboarding(page);
    await openPlanComparison(page);
    await expect(page.getByText(/school licence/i).first()).toBeVisible();
  });

  test('a teacher is not shown a free-tier marking limit', async ({ page }) => {
    await signIn(page, 'teacher');
    await clearOnboarding(page);
    await openFirstQuestion(page);
    await expect(page.getByTestId('free-eval-counter')).toHaveCount(0);
  });
});

test.describe('an unlocked account sees no paywall', () => {
  test('an admin is metered by nothing and sold nothing', async ({ page }) => {
    await signIn(page, 'admin');
    await clearOnboarding(page);
    await openFirstQuestion(page);
    await expect(page.getByTestId('free-eval-counter')).toHaveCount(0);
    await openPlanComparison(page);
    // Nothing to upgrade to: the CTA is for free-plan accounts only.
    await expect(page.getByRole('button', { name: /See Band 6 Plus/i })).toHaveCount(0);
  });
});
