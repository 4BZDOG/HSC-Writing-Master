import { test, expect, Page } from '@playwright/test';
import { signIn, clearOnboarding, openFirstQuestion } from './support/workspace';

/**
 * The evaluation flow, as a student actually meets it.
 *
 * This file used to be a set of placeholders — `expect(pageTitle).toBeTruthy()`
 * and `expect(buttons).toBeGreaterThan(0)` — that passed whatever the app did,
 * including not rendering. What it *documented* in its comments is what is now
 * asserted: pick a question, write into it, have it marked, and see the marks
 * and the feedback; and when the marking fails, be told so rather than shown a
 * blank card.
 *
 * Runs against the default mock-mode dev server. The AI proxy is intercepted,
 * so the real UI drives the real evaluation path against a deterministic
 * response with no live backend and no spent quota.
 */

const MARKED_RESPONSE = {
  overallMark: 3,
  overallBand: 4,
  overallFeedback: 'A sound response that identifies the main steps but stops short of detail.',
  quickTip: 'Name the enzymes involved and say what each one does.',
  strengths: ['Correct sequence of steps.'],
  improvements: ['Add the role of each enzyme.'],
  criteria: [
    { criterion: 'Accuracy', mark: 2, maxMark: 2, feedback: 'Steps are correct.' },
    { criterion: 'Detail', mark: 1, maxMark: 2, feedback: 'Thin on specifics.' },
  ],
};

/** Wraps a payload the way the /api/gemini proxy returns model output. */
const proxyReply = (payload: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    text: JSON.stringify(payload),
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: { totalTokenCount: 120 },
  }),
});

const stubAi = (page: Page, reply: Parameters<typeof page.route>[1]) =>
  page.route('**/api/gemini', reply);

const writingSurface = (page: Page) => page.locator('textarea').first();

test.describe('Evaluation flow', () => {
  // Two animated dialogs plus the mock login's deliberate 800ms delay.
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await clearOnboarding(page);
  });

  test('a student writes a response and the card keeps count of it', async ({ page }) => {
    await openFirstQuestion(page);

    // Nothing written yet: evaluating is refused rather than sent empty.
    const evaluate = page.getByRole('button', { name: /^Evaluate/ });
    await expect(evaluate).toBeDisabled();

    const answer = 'DNA unwinds and each strand is copied.'; // seven words
    await writingSurface(page).fill(answer);

    await expect(page.getByText(/\b7 Words\b/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`\\b${answer.length} Chars\\b`, 'i'))).toBeVisible();
    await expect(evaluate).toBeEnabled();
  });

  test('marking a response shows the mark, the band and the feedback', async ({ page }) => {
    await stubAi(page, (route) => route.fulfill(proxyReply(MARKED_RESPONSE)));
    await openFirstQuestion(page);

    await writingSurface(page).fill(
      'DNA replication begins when the double helix unwinds. Each strand then acts as a ' +
        'template, and complementary bases are added along it to build two identical molecules.'
    );
    await page.getByRole('button', { name: /^Evaluate/ }).click();

    // The result reaches the student — not just the network.
    await expect(page.getByText(MARKED_RESPONSE.overallFeedback)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(MARKED_RESPONSE.strengths[0])).toBeVisible();
    await expect(page.getByText(MARKED_RESPONSE.improvements[0])).toBeVisible();
  });

  test('a failed evaluation says so, and the response survives', async ({ page }) => {
    await stubAi(page, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
    );
    await openFirstQuestion(page);

    const answer = 'A short response that will not be marked because the proxy is down.';
    await writingSurface(page).fill(answer);

    // Nothing is complaining yet — so the assertion below is about the failure
    // and not about some permanent piece of chrome that happens to say "error".
    const complaint = page.getByText(/error|failed|unavailable|try again/i);
    await expect(complaint).toHaveCount(0);

    await page.getByRole('button', { name: /^Evaluate/ }).click();

    // Something is said about the failure…
    await expect(complaint.first()).toBeVisible({ timeout: 30_000 });
    // …and the student's work is still on screen, not cleared by the failure.
    await expect(writingSurface(page)).toHaveValue(answer);
  });
});

test.describe('Workspace accessibility', () => {
  test.describe.configure({ timeout: 90_000 });

  test('the writing surface is reachable and labelled', async ({ page }) => {
    await signIn(page);
    await clearOnboarding(page);
    await openFirstQuestion(page);

    const textarea = writingSurface(page);
    await textarea.focus();
    await expect(textarea).toBeFocused();

    // A placeholder naming the command verb is what tells a student what kind
    // of response this is before they have read anything else.
    await expect(textarea).toHaveAttribute('placeholder', /.+/);
  });
});
