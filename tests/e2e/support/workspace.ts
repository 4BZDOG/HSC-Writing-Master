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
  await settleVerbRibbon(page);
};

/**
 * Send every toast away before measuring anything.
 *
 * `clearOnboarding` imports the bundled curriculum, which raises an info toast
 * ("Synchronised 2 items…") that dismisses itself about five seconds later. So
 * whether it is on screen when a spec takes its reading is a race with how fast
 * the machine walked the picker — a measurement that changes with the weather.
 * It is transient chrome rather than part of the screen under test, so it is
 * dismissed rather than waited out or measured.
 */
const dismissToasts = async (page: Page): Promise<void> => {
  const close = page.getByRole('button', { name: /close notification/i });
  for (let i = 0; i < 5 && (await close.count()); i++) {
    // Best effort: a toast that reaches the end of its own countdown between
    // the count and the click takes its button with it, and that is the
    // outcome this is asking for anyway.
    await close
      .first()
      .click({ force: true, timeout: 2_000 })
      .catch(() => {});
  }
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 15_000 });
};

/**
 * Walk the syllabus picker down to a dot point — and stop one level short of a
 * question, because choosing one folds the navigator away.
 *
 * That fold is why this helper has to exist. `openFirstQuestion` takes the last
 * step, `App.tsx` collapses the navigator to a breadcrumb and unmounts it, and
 * every spec in this suite reaches the workspace through that door. The
 * contrast audit has therefore never measured a single colour in the app's
 * first screen — which is how a selected focus area came to be white on
 * near-white at 1.10:1 there, in the open, for as long as the suite has
 * existed.
 *
 * Four things this has to know, none of them guessable from the markup:
 *
 *   - **`admin`, not the free tier.** Several of the navigator's colours are on
 *     curator-only controls — "Manual", "Reset Focus", the amber `special`
 *     action label — and a `user` session never renders them.
 *   - **The course is already chosen.** Importing the bundled library
 *     auto-selects it, so there is no `Select Course...` trigger to click and a
 *     helper that insists on one waits forever.
 *   - **Topic 1, sub-topic 0.** Focus areas are read out of a dot point's
 *     trailing "including …" list, and the *first* sub-topic of the first topic
 *     has none. In the bundled `HSC Biology (Advanced)` the first dot point
 *     carrying them sits under the second topic's first sub-topic. Without
 *     walking there the focus tile, the focus count and the Active Focus picker
 *     are all absent, and three of the repaired sites cannot be seen.
 *   - **The focus area has to be chosen, not merely available.** The focus
 *     pill, the "Reset Focus" control and the selected row's own styling — the
 *     1.10:1 site itself — only exist once one is active.
 *
 * Leaves both dropdowns shut; `openNavigatorPicker` opens whichever one the
 * caller means to look inside.
 */
export const openNavigatorToDotPoint = async (page: Page): Promise<void> => {
  const choose = async (placeholder: string, index: number) => {
    const trigger = page.locator('button[aria-haspopup="listbox"]', { hasText: placeholder });
    if (!(await trigger.count())) return; // chosen for us already
    // The list opens below the fold on a short viewport, and Playwright's
    // actionability check reads that as covered.
    await trigger.first().click({ force: true });
    const option = page.getByRole('option').nth(index);
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    await option.click({ force: true });
    await expect(trigger).toHaveCount(0, { timeout: 10_000 });
  };

  await choose('Select Topic...', 1);
  await choose('Select Sub-Topic...', 0);
  await choose('Select Dot Point...', 0);

  // Activating a focus area is a toggle, so the trigger keeps its placeholder
  // and cannot be waited on the way the levels above can. The pill it raises is
  // the thing to wait for.
  const focus = page.locator('button[aria-haspopup="listbox"]', { hasText: 'Refine Scope...' });
  await expect(focus).toHaveCount(1, { timeout: 10_000 });
  await focus.first().click({ force: true });
  const focusOption = page.getByRole('option').first();
  await focusOption.waitFor({ state: 'visible', timeout: 10_000 });
  await focusOption.click({ force: true });
  await expect(page.getByTitle('Reset Focus')).toHaveCount(1, { timeout: 10_000 });

  await dismissToasts(page);
};

/**
 * Open one of the navigator's dropdowns by its placeholder.
 *
 * Only one can be open at a time, and what each holds is different enough to be
 * worth measuring separately: the question list carries the tier-washed rows,
 * their verb chips and their marks labels; the Active Focus list carries the
 * selected focus row and its solid emerald tile. Neither exists in the DOM
 * while shut.
 *
 * The placeholders are the same load-bearing strings `openFirstQuestion`
 * matches on — do not retype them here or there.
 */
export const openNavigatorPicker = async (page: Page, placeholder: string): Promise<void> => {
  const trigger = page.locator('button[aria-haspopup="listbox"]', { hasText: placeholder });
  await expect(trigger).toHaveCount(1, { timeout: 10_000 });
  if ((await trigger.first().getAttribute('aria-expanded')) !== 'true') {
    await trigger.first().click({ force: true });
  }
  await expect(trigger.first()).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 10_000 });
};

/**
 * Wait for the verb ribbon to finish folding.
 *
 * Choosing a question folds the syllabus navigator down to a breadcrumb, and
 * the ribbon folds with it — a 700ms `grid-rows` transition on a panel about
 * 700px tall. The question card renders long before that finishes, so a spec
 * that measured the page as soon as it appeared was measuring a document still
 * losing height under it: `modal-scroll` read a scroll offset, the panel
 * collapsed, the browser clamped the offset, and the scroll lock pinned the
 * page somewhere the test had never asked for.
 *
 * Waiting on the panel's own height rather than on a timeout, so this stays
 * true if the animation is ever retuned.
 */
export const settleVerbRibbon = async (page: Page): Promise<void> => {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const toggle = document.querySelector(
            'button[aria-label*="command verb hierarchy" i][aria-controls]'
          );
          if (!toggle) return 0;
          const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
          return panel ? Math.round(panel.getBoundingClientRect().height) : 0;
        }),
      { timeout: 15_000 }
    )
    .toBe(0);
};

/**
 * Unfold the verb ribbon, so what is inside it can be looked at.
 *
 * It is shut beneath the breadcrumb by design, and what it hides is the largest
 * block of tier-coloured text in the application — six tier cards, thirty-eight
 * verb chips, a detail card and a timeline, all of them drawn from the same
 * `getBandConfig` palette that every light-theme defect this project has shipped
 * came out of. Until the ribbon rendered in this state at all, no e2e test had
 * ever seen a pixel of it.
 *
 * Note what the contrast audit still cannot say about it, so the green tick is
 * not read as more than it is: anything whose background resolves to a gradient
 * is returned `unassessable`, which covers the tier underline and the current
 * tier card's header; and anything on a saturated tier fill is measured but not
 * gated, because `neutralBackground` is false for amber and green. The
 * tier-coloured text in this component is still partly on the honour system.
 */
export const openVerbRibbon = async (page: Page): Promise<void> => {
  const toggle = page.getByRole('button', { name: /command verb hierarchy reference/i });
  if (!(await toggle.count())) return;
  if ((await toggle.first().getAttribute('aria-expanded')) === 'false') {
    await toggle.first().click();
  }
  await expect(toggle.first()).toHaveAttribute('aria-expanded', 'true');
  // The panel opens on the same 700ms transition it folds on, and a reading
  // taken mid-animation is a reading of a half-height panel.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const button = document.querySelector(
            'button[aria-label*="command verb hierarchy" i][aria-controls]'
          );
          if (!button) return 0;
          const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
          return panel ? Math.round(panel.getBoundingClientRect().height) : 0;
        }),
      { timeout: 15_000 }
    )
    .toBeGreaterThan(200);
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
