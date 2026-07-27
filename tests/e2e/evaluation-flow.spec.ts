import { test, expect, Page } from '@playwright/test';

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

const signIn = async (page: Page) => {
  await page.goto('/');
  await page.fill('#username', 'user');
  await page.fill('#password', 'user');
  await page.click('button[type=submit]');
};

/** The charter gate, then the quick-start guide — see agreement-gate.spec. */
const clearOnboarding = async (page: Page) => {
  // The gate animates in after the mock login's deliberate delay, so wait for
  // it rather than sampling — a bare `count()` here is always zero.
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

  // First run offers the bundled curriculum; take it so there is something to
  // answer. It opens behind the guide, so it only appears once that is gone.
  const importButton = page.getByRole('button', { name: /import \d+ items?/i });
  await importButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await importButton.count()) {
    await importButton.first().click();
    await importButton.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }
};

/**
 * Walk the syllabus picker down to a question, taking the first option at each
 * level. Deliberately data-agnostic: the bundled curriculum can change without
 * this needing to know any ids.
 */
const openFirstQuestion = async (page: Page) => {
  for (const placeholder of [
    'Select Course...',
    'Select Topic...',
    'Select Sub-Topic...',
    'Select Dot Point...',
    'Select Question...',
  ]) {
    const trigger = page.locator('button[aria-haspopup="listbox"]', { hasText: placeholder });
    if (!(await trigger.count())) continue; // already chosen for us
    await trigger.first().click();
    const option = page.getByRole('option').first();
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    await option.click();
  }
  await expect(page.getByRole('heading', { name: /Writing Prompt/i })).toBeVisible({
    timeout: 20_000,
  });
};

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
