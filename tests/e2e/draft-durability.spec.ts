import { test, expect, Page, BrowserContext } from '@playwright/test';
import { clearOnboarding, openFirstQuestion, openWorkspace } from './support/workspace';

/**
 * A student's draft is the one thing this app must never lose. Three ways it
 * was lost, each pinned here against a real browser rather than a mock:
 *
 *  1. Two tabs on the same question clobbered each other: the older tab wrote
 *     its whole library back and reverted the newer tab's draft.
 *  2. The last couple of seconds of typing were lost when the tab closed,
 *     because the write waited on a one-second timer the unload could beat.
 *  3. The footer said "Saved" while storage was refusing every write.
 */

const RESPONSE = (page: Page) => page.getByLabel('Your response');
const SAVED = /^Saved$/;
const NOT_SAVED = /Not saved/;

/**
 * What is actually in IndexedDB for `text`, read from the page's own origin.
 * The footer's "Saved" only says the on-screen state matches the library in
 * memory, so the durability checks read the store itself.
 */
const storeHolds = (page: Page, text: string): Promise<boolean> =>
  page.evaluate(
    (wanted) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('hsc-ai-evaluator-db');
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction('main_store', 'readonly')
            .objectStore('main_store')
            .get('courses_data');
          read.onerror = () => resolve(false);
          read.onsuccess = () => {
            const courses = (read.result ?? []) as Array<{
              topics?: Array<{
                subTopics?: Array<{
                  dotPoints?: Array<{ prompts?: Array<{ userDraft?: string }> }>;
                }>;
              }>;
            }>;
            const found = JSON.stringify(courses).includes(wanted);
            db.close();
            resolve(found);
          };
        };
      }),
    text
  );

/** The id of the question whose stored draft is `text`, read from IndexedDB. */
const draftPromptId = (page: Page, text: string): Promise<string | null> =>
  page.evaluate(
    (wanted) =>
      new Promise<string | null>((resolve) => {
        const open = indexedDB.open('hsc-ai-evaluator-db');
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction('main_store', 'readonly')
            .objectStore('main_store')
            .get('courses_data');
          read.onerror = () => resolve(null);
          read.onsuccess = () => {
            type P = { id: string; userDraft?: string };
            type Tree = {
              topics?: Array<{ subTopics?: Array<{ dotPoints?: Array<{ prompts?: P[] }> }> }>;
            };
            let found: string | null = null;
            for (const course of (read.result ?? []) as Tree[])
              for (const topic of course.topics ?? [])
                for (const sub of topic.subTopics ?? [])
                  for (const dp of sub.dotPoints ?? [])
                    for (const p of dp.prompts ?? []) if (p.userDraft === wanted) found = p.id;
            db.close();
            resolve(found);
          };
        };
      }),
    text
  );

/** Opens the question at `index` in the current dot point's question list. */
const openQuestionAt = async (page: Page, index: number): Promise<void> => {
  await page.getByRole('button', { name: 'Change question' }).click();
  await page.locator('button[aria-haspopup="listbox"]').last().click();
  const option = page.getByRole('option', { disabled: false }).nth(index);
  // The list fills a moment after it opens, so the option is awaited rather than clicked on sight.
  await option.waitFor({ state: 'visible', timeout: 20_000 });
  await option.click({ timeout: 30_000 });
  await expect(RESPONSE(page)).toBeVisible({ timeout: 20_000 });
};

/** Moves the open workspace to a different question in the same dot point (the second one). */
const switchToSecondQuestion = (page: Page): Promise<void> => openQuestionAt(page, 1);

/**
 * A further tab on the same browser. The session is shared, so it is usually already signed
 * in and has no login form; the first tab's sign-in is what it needs.
 */
const openIn = async (context: BrowserContext): Promise<Page> => {
  const page = await context.newPage();
  await page.goto('/');
  const loginForm = page.locator('#username');
  if (
    await loginForm.waitFor({ state: 'visible', timeout: 5_000 }).then(
      () => true,
      () => false
    )
  ) {
    await page.fill('#username', 'user');
    await page.fill('#password', 'user');
    await page.click('button[type=submit]');
  }
  await clearOnboarding(page);
  // The session restores the question it was on, so usually the writing surface is already here.
  const surface = RESPONSE(page);
  if (
    !(await surface.waitFor({ state: 'visible', timeout: 15_000 }).then(
      () => true,
      () => false
    ))
  ) {
    await openFirstQuestion(page);
  }
  // The first-run import and the curriculum settle a moment after the surface appears; a
  // question typed into before they finish can be reset by the reload they cause.
  await page.waitForTimeout(1500);
  return page;
};

test.describe('draft durability', () => {
  test('a second tab does not revert a draft written in the first', async ({ browser }) => {
    // Three tabs are opened on a shared, loaded app, so this takes a while on a busy runner.
    test.setTimeout(300_000);
    const context = await browser.newContext();

    // Both tabs load the same question while it is still empty.
    const a = await openIn(context);
    const b = await openIn(context);

    await RESPONSE(a).fill('alpha draft');
    await expect(a.getByText(SAVED)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => storeHolds(a, 'alpha draft'), { timeout: 15_000 }).toBe(true);

    // Tab B, still holding the empty Q1, writes Q2.
    await switchToSecondQuestion(b);
    await RESPONSE(b).fill('beta draft');
    await expect(b.getByText(SAVED)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => storeHolds(b, 'beta draft'), { timeout: 15_000 }).toBe(true);

    // The store still holds A's Q1 text after B's write.
    expect(await storeHolds(b, 'alpha draft')).toBe(true);

    // A new tab opens on the question this browser last showed (Q2), so both are checked by choice.
    const c = await openIn(context);
    await openQuestionAt(c, 0);
    await expect(RESPONSE(c)).toHaveValue('alpha draft');
    await openQuestionAt(c, 1);
    await expect(RESPONSE(c)).toHaveValue('beta draft');
  });

  test('what is typed just before the tab closes is kept', async ({ browser }) => {
    test.setTimeout(120_000);
    const context = await browser.newContext();
    const page = await openIn(context);

    const sentence = 'A sentence typed in the instant before the tab is closed.';
    await RESPONSE(page).fill(sentence);
    // Well inside the one-second save delay: the write has to start on the way out.
    await page.waitForTimeout(200);
    // A real unload: the document is replaced, so pagehide and unload fire.
    await page.goto('about:blank');

    const again = await openIn(context);
    await expect(RESPONSE(again)).toHaveValue(sentence, { timeout: 20_000 });
  });

  test('the footer says Not saved when storage refuses the write', async ({ page }) => {
    test.setTimeout(120_000);
    await openWorkspace(page);

    await page.evaluate(() => {
      const w = window as unknown as { __realPut?: unknown };
      w.__realPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
    });

    try {
      await RESPONSE(page).fill('refused draft');
      await expect(page.getByText(NOT_SAVED).first()).toBeVisible({ timeout: 15_000 });
      // Several autosave cycles with storage still refusing: never "Saved".
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(1200);
        await expect(page.getByText(SAVED)).toHaveCount(0);
      }
    } finally {
      await page.evaluate(() => {
        const w = window as unknown as { __realPut?: typeof IDBObjectStore.prototype.put };
        if (w.__realPut) IDBObjectStore.prototype.put = w.__realPut;
      });
    }

    await RESPONSE(page).fill('accepted draft');
    await expect(page.getByText(SAVED)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(NOT_SAVED)).toHaveCount(0);
  });

  test('a stashed draft does not overwrite a newer stored draft', async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext();
    const page = await openIn(context);

    await RESPONSE(page).fill('stored draft');
    await expect.poll(() => storeHolds(page, 'stored draft'), { timeout: 15_000 }).toBe(true);
    const promptId = await draftPromptId(page, 'stored draft');
    expect(promptId).not.toBeNull();

    // A stash written over a draft that is no longer the stored one.
    await page.evaluate(
      (id) =>
        window.localStorage.setItem(
          'hsc.pendingDraft',
          JSON.stringify({
            promptId: id,
            text: 'older stash',
            prev: 'something else',
            at: Date.now(),
          })
        ),
      promptId
    );
    await page.reload();

    await expect(RESPONSE(page)).toHaveValue('stored draft', { timeout: 30_000 });
    expect(await page.evaluate(() => window.localStorage.getItem('hsc.pendingDraft'))).toBeNull();
  });
});
