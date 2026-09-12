import { test, expect, Page } from '@playwright/test';
import { signIn, clearOnboarding, openFirstQuestion } from './support/workspace';

/**
 * The daily AI allowance, as a student meets it.
 *
 * The chain has three links and the unit tests only cover the middle one.
 * `utils/quotaWarnings.ts` decides which threshold a usage snapshot crosses,
 * and is tested in isolation. What nothing exercised end to end is that the
 * snapshot ever reaches it and that the verdict ever reaches the student:
 * the proxy stamps `__quota` onto every authenticated response, aiCore feeds it
 * to quotaNotifier, the notifier dedupes per UTC day, and App turns a warning
 * into a toast. A break anywhere along that wire is silent — the student simply
 * hits a 429 wall one day with no warning, which is the exact failure the
 * feature exists to prevent.
 *
 * Runs against the mock-mode dev server with the proxy intercepted, so the real
 * UI drives the real path and the numbers are ours to choose.
 *
 * Each test gets a fresh browser context, so the notifier's per-day dedupe
 * record in localStorage starts empty — which is what lets the dedupe test
 * below fire twice and expect one toast, rather than fighting a leftover.
 */

const MARKED_RESPONSE = {
  overallMark: 3,
  overallBand: 4,
  overallFeedback: 'A sound response that covers the main steps.',
  quickTip: 'Name each step.',
  strengths: ['Clear sequence.'],
  improvements: ['Add detail.'],
  criteria: [{ criterion: 'Accuracy', mark: 3, maxMark: 6, feedback: 'Mostly right.' }],
};

/**
 * A proxied model response carrying the caller's post-call usage, exactly as
 * api/gemini.ts stamps it on. `quota` omitted means an unmetered deployment —
 * no Supabase, so nothing to meter — and the client must stay quiet for it.
 */
const proxyReply = (quota?: { used: number; limit: number }) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    text: JSON.stringify(MARKED_RESPONSE),
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: { totalTokenCount: 120 },
    ...(quota ? { __quota: quota } : {}),
  }),
});

/** The proxy's refusal once the allowance is gone (api/gemini.ts, 429 branch). */
const refusal = (quota: { used: number; limit: number }) => ({
  status: 429,
  contentType: 'application/json',
  body: JSON.stringify({
    error:
      `Daily AI limit reached (${quota.used}/${quota.limit} calls used today). ` +
      'Your allowance resets at midnight UTC — ask an admin if you need more.',
    quota,
  }),
});

const writingSurface = (page: Page) => page.locator('textarea').first();

/** Mark an answer and wait for the request to have actually gone out. */
const evaluate = async (page: Page, answer: string) => {
  await writingSurface(page).fill(answer);
  const sent = page.waitForRequest((r) => r.url().includes('/api/gemini'), { timeout: 30_000 });
  await page.getByRole('button', { name: /^Evaluate/ }).click();
  await sent;
};

/**
 * Marking opens its report in a dialog, which covers the writing surface — so a
 * second evaluation has to shut it first, or the click never lands.
 */
const closeFeedback = async (page: Page) => {
  const close = page.getByRole('button', { name: /close feedback/i });
  await close.click({ timeout: 30_000 });
  await expect(close).toHaveCount(0, { timeout: 15_000 });
};

/**
 * Two answers, because the second evaluation must actually reach the network.
 * `AICache.generateEvaluationKey` keys on the prompt and the answer text, so
 * re-marking the same words is served from IndexedDB and the proxy is never
 * called — which would make the dedupe test below pass for the wrong reason.
 */
const FIRST = 'DNA replication begins when the double helix unwinds along its length.';
const SECOND = 'Each separated strand then acts as a template for a new complementary strand.';

test.describe('daily AI allowance', () => {
  // Two animated dialogs plus the mock login's deliberate 800ms delay.
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await clearOnboarding(page);
  });

  test('warns as the allowance runs low', async ({ page }) => {
    await page.route('**/api/gemini', (route) =>
      route.fulfill(proxyReply({ used: 40, limit: 50 }))
    );
    await openFirstQuestion(page);
    await evaluate(page, FIRST);

    // The figures are the student's own, not a generic "running low".
    await expect(page.getByText(/you've used 80% of today's AI allowance/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/40\/50 calls/i)).toBeVisible();
  });

  test('says so when the allowance is spent, while still marking the answer', async ({ page }) => {
    // The 100% snapshot rides on a SUCCESSFUL call — the one that spent the
    // last unit. The marking must still arrive; the warning is about the next
    // call, not this one.
    await page.route('**/api/gemini', (route) =>
      route.fulfill(proxyReply({ used: 50, limit: 50 }))
    );
    await openFirstQuestion(page);
    await evaluate(page, FIRST);

    await expect(page.getByText(/Daily AI limit reached/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(MARKED_RESPONSE.overallFeedback)).toBeVisible({ timeout: 30_000 });
  });

  test('stays quiet while there is plenty left', async ({ page }) => {
    await page.route('**/api/gemini', (route) =>
      route.fulfill(proxyReply({ used: 10, limit: 50 }))
    );
    await openFirstQuestion(page);
    await evaluate(page, FIRST);

    // The marking lands…
    await expect(page.getByText(MARKED_RESPONSE.overallFeedback)).toBeVisible({ timeout: 30_000 });
    // …and nothing was said about the allowance. A warning at 20% would train a
    // student to ignore the one that matters.
    await expect(page.getByText(/AI allowance|Daily AI limit/i)).toHaveCount(0);
  });

  test('warns once per threshold, not once per call', async ({ page }) => {
    await page.route('**/api/gemini', (route) =>
      route.fulfill(proxyReply({ used: 41, limit: 50 }))
    );
    await openFirstQuestion(page);

    await evaluate(page, FIRST);
    const warning = page.getByText(/you've used \d+% of today's AI allowance/i);
    await expect(warning).toBeVisible({ timeout: 30_000 });

    // Let the toast go before the second call, so what is asserted afterwards
    // is a NEW toast rather than the first one still on screen.
    await expect(warning).toHaveCount(0, { timeout: 30_000 });

    await closeFeedback(page);
    await evaluate(page, SECOND);
    // Still over 80%, already warned today — the notifier must not repeat it.
    await expect(page.getByText(MARKED_RESPONSE.overallFeedback)).toBeVisible({ timeout: 30_000 });
    await expect(warning).toHaveCount(0);
  });

  test('a refusal tells the student, and does not take their work with it', async ({ page }) => {
    await page.route('**/api/gemini', (route) => route.fulfill(refusal({ used: 50, limit: 50 })));
    await openFirstQuestion(page);

    await writingSurface(page).fill(FIRST);
    await page.getByRole('button', { name: /^Evaluate/ }).click();

    // The server's own wording reaches the student, rather than a bare
    // "something went wrong" — it is the only place the reset time is said.
    await expect(page.getByText(/Daily AI limit reached/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(writingSurface(page)).toHaveValue(FIRST);
  });

  test('an unmetered deployment is never warned about a limit it has not got', async ({ page }) => {
    // No Supabase server-side means no quota to echo: api/gemini.ts omits
    // `__quota` entirely. A client that invented a warning here would nag every
    // user of a keyless local deployment.
    await page.route('**/api/gemini', (route) => route.fulfill(proxyReply()));
    await openFirstQuestion(page);
    await evaluate(page, FIRST);

    await expect(page.getByText(MARKED_RESPONSE.overallFeedback)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/AI allowance|Daily AI limit/i)).toHaveCount(0);
  });
});
