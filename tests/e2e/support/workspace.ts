import { expect, Page } from '@playwright/test';

/**
 * Getting to a question, shared by every spec that needs one.
 *
 * Each spec grew its own copy of these three steps, and by the third they had
 * started to disagree about timeouts. They are the app's front door, not the
 * subject of any one test, so they live here.
 */

/**
 * Sign in as one of the mock accounts. `user` is the free tier, which is what
 * most specs want; `admin` holds the most permissive plan, so it is the one to
 * use when a spec needs a feature the free tier has withheld (the answer
 * rewrite, PDF export).
 */
export const signIn = async (page: Page, account: 'user' | 'admin' = 'user'): Promise<void> => {
  await page.goto('/');
  await page.fill('#username', account);
  await page.fill('#password', account);
  await page.click('button[type=submit]');
};

/** The charter gate, then the quick-start guide, then the bundled curriculum. */
export const clearOnboarding = async (page: Page): Promise<void> => {
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
export const openFirstQuestion = async (page: Page): Promise<void> => {
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

/** Sign in, clear the gates and open a question — the usual preamble. */
export const openWorkspace = async (page: Page): Promise<void> => {
  await signIn(page);
  await clearOnboarding(page);
  await openFirstQuestion(page);
};

/**
 * Open one of the admin/teacher tools. They used to sit on the header rail as
 * eight separate buttons; they now live behind a single overflow control, so
 * reaching one is two clicks and the first of them is the one worth waiting on.
 *
 * The wait belongs on the TRIGGER, not on the tool. On a Supabase run the
 * header renders before the profile query comes back, and until the role
 * resolves to admin or moderator there is no trigger in the DOM at all — a
 * click without this wait races the role and misses. Once the trigger is there
 * the panel is synchronous, so the tool itself needs no timeout of its own.
 *
 * `name` matches the tool's `aria-label`, which is still the full canonical
 * string ("Class Insights (where the cohort is struggling)"). Do not match on
 * visible text: the panel breaks each label over two lines, so the words are no
 * longer adjacent on screen even though the accessible name is unchanged.
 *
 * The panel is portalled to `document.body`, outside `<header>` — a locator
 * scoped to the header element will not find it.
 */
export const openHeaderTool = async (page: Page, name: RegExp): Promise<void> => {
  // `Admin tools` for a system admin, `Teaching tools` for a moderator; nothing
  // else in the header matches either word.
  const trigger = page.getByRole('button', { name: /(admin|teaching) tools/i });
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await trigger.click();
  await page.getByRole('button', { name }).click();
};
