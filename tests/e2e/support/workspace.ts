import { expect, Locator, Page } from '@playwright/test';

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
 * rewrite, PDF export). `teacher` is the third: it holds Plus through the
 * staff perk, which makes it the account with NOTHING locked and no
 * subscription of its own — the case the paywall's routing has to answer
 * without ever showing it a lock.
 */
export const signIn = async (
  page: Page,
  account: 'user' | 'teacher' | 'admin' = 'user'
): Promise<void> => {
  await page.goto('/');
  await page.fill('#username', account);
  await page.fill('#password', account);
  await page.click('button[type=submit]');
};

/**
 * The accessible name of the writing card's Evaluate button, for
 * `getByRole('button', { name: EVALUATE_BUTTON })`.
 *
 * It is not simply `/^Evaluate/`, which used to be enough. The verb ribbon's top
 * tier is called "Evaluate, Synthesise & Create", and its header button is
 * named after it — formerly behind a system emoji, so the name began with a
 * trophy and no prefix match could reach it; now behind an `aria-hidden` icon,
 * so the name begins with the word. Both buttons are in the document whenever a
 * question is open (the ribbon is only inert while shut, and Playwright does not
 * treat `inert` as hidden), and a locator that matches two is a strict-mode
 * failure rather than a choice.
 *
 * Not `exact: true` either. On a desktop viewport the button carries its
 * keyboard hint, so its name is "Evaluate Ctrl ↵" and an exact match finds
 * nothing; on a phone the hint is hidden and the name is just "Evaluate". What
 * tells the two buttons apart on both is that the tier header is "Evaluate" and
 * then a COMMA, so the pattern is the word at the start, not followed by one.
 */
export const EVALUATE_BUTTON = /^Evaluate(?!,)/;

/** The charter gate, then the quick-start guide, then the bundled curriculum. */
export const clearOnboarding = async (page: Page): Promise<void> => {
  // The gate animates in after the mock login's deliberate delay, so wait for
  // it rather than sampling — a bare `count()` here is always zero.
  const agree = page.getByRole('button', { name: /agree and continue/i });
  await agree.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await agree.count()) {
    // Scoped to the gate's own dialog. A bare page-wide `getByRole('checkbox')`
    // now competes with the first-run syllabus import, which renders eight of
    // its own behind the gate — and on the guest path gets there first. Unscoped
    // it is either the wrong checkbox or a strict-mode violation, depending on
    // which of the two wins the race.
    // Bounded at 30 s, so a click that cannot land fails loudly rather than hanging
    // for the rest of the test. Not shorter: WebKit settles these slowly on a loaded
    // runner, and a shorter bound fails a click that would have landed.
    const gate = page.getByRole('dialog').filter({ has: agree });
    await gate.getByRole('checkbox').first().check({ timeout: 30_000 });
    await agree.click({ timeout: 30_000 });
    await agree.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  }
  // Dismiss the quick-start guide by firing ITS OWN button's handler, and
  // check that it actually went.
  //
  // This used to be a bare `page.keyboard.press('Escape')` whose follow-up
  // wait swallowed its own timeout. Two things defeat that. The guide animates
  // in after the mock login's deliberate delay, so under load the keystroke
  // can arrive before the modal is listening; and at a phone width the guide
  // and the curriculum-import prompt are open AT THE SAME TIME, so a single
  // Escape is arbitrated by `useEscapeKey`'s stack to whichever registered
  // last and the guide stays put.
  //
  // Replacing it with a real `.click()` swapped one swallowed failure for
  // another. On Mobile Safari — iPhone 12, so a 390px viewport at a device
  // pixel ratio of 3 — the click never got past Playwright's "visible, enabled
  // and stable" wait inside the five-second budget it was given, on a runner
  // already hosting two WebKit workers and two Vite dev servers. Chromium
  // resolves the same click in about 100ms. Three attempts each ate their
  // budget in silence, the guide stayed open, and the NEXT click in the helper
  // spent the whole 120-second test timeout being told the guide's backdrop
  // "intercepts pointer events" — which is how one un-dismissed modal produced
  // nine failures across three unrelated specs.
  //
  // So this helper no longer re-proves the guide's buttons are clickable on
  // every spec that merely wants past them. `dispatchEvent` runs the React
  // handler without the actionability wait, and `paywall.spec.ts` pins the
  // real thing — that the X is reachable by a genuine click at a phone width,
  // which is where it was covered until this branch.
  //
  // Scoped by the dialog that contains the guide's own tabs, so it cannot pick
  // up the import prompt's buttons or a toast's "Close notification".
  const guideDialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('button', { name: /getting started/i }) });
  await guideDialog.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await guideDialog.count()) {
    // "Start writing" rather than the header's X: it is the guide's own
    // primary action and the one a student actually presses. `.last()` because
    // both it and the X match, and the footer comes later in the DOM.
    await guideDialog
      .getByRole('button', { name: /start writing|^close$/i })
      .last()
      .dispatchEvent('click', undefined, { timeout: 30_000 });
    // Loud, and at the point of the problem. A swallowed failure here reports
    // itself two minutes later as an unrelated click on an unrelated spec.
    await expect(guideDialog).toHaveCount(0, { timeout: 20_000 });
  }

  // First run offers the bundled curriculum; take it so there is something to
  // answer. It opens behind the guide, so it only appears once that is gone.
  // "Add N syllabuses" — the button used to read "Import N Items", which named
  // a database operation on a count of records rather than the thing a teacher
  // is actually doing.
  const importButton = page.getByRole('button', { name: /add \d+ syllabus(es)?/i });
  await importButton.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  if (await importButton.count()) {
    await importButton.first().click();
    await importButton.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  }
};

/** A picker's trigger, found by the placeholder or the label it now shows. */
const pickerNamed = (page: Page, text: string): Locator =>
  page.locator('button[aria-haspopup="listbox"]', { hasText: text });

/**
 * Opens a picker and waits for its options. Re-opens it if the list came up
 * empty, and returns false when nothing showed, so the caller decides whether
 * that is an error.
 *
 * The options are populated from the curriculum import that `clearOnboarding`
 * has just kicked off, so a picker opened in the gap between "the trigger
 * exists" and "the courses are in IndexedDB" renders no options at all — and a
 * single `waitFor` on a list that will never fill just burns its timeout.
 * Re-opening is what actually re-reads the data.
 */
const openPicker = async (page: Page, trigger: Locator): Promise<boolean> => {
  const option = page.getByRole('option').first();
  for (let attempt = 0; attempt < 3; attempt++) {
    // Bounded, because an unbounded click waits for the picker to be "stable"
    // for as long as the test has left. Under load it can stay in motion for
    // minutes, and the test hung that way twice with no assertion to say why.
    // A click that times out is retried below like an empty list.
    await trigger
      .first()
      .click({ timeout: 30_000 })
      .catch(() => {});
    try {
      await option.waitFor({ state: 'visible', timeout: 5_000 });
      return true;
    } catch {
      // Shut the empty list before trying again, or the next click re-opens
      // onto the same stale popup.
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  return false;
};

/**
 * How many dot points the walk tries before it gives up. Every dot point in the
 * bundled curriculum has a question, and most have one a free account can open,
 * so the walk seldom needs more than its first.
 */
const DOT_POINTS_TO_TRY = 8;

/**
 * Walk the dot point and question pickers down to a question this account can
 * open.
 *
 * A free account sees the questions above its tier ceiling, but disabled, and
 * the list is sorted by tier. A dot point whose questions are all above the
 * ceiling (Business Studies' first one, two tier-5 questions) therefore puts a
 * disabled option first. Clicking that waits for an enabled state that never
 * comes, and the first attempt timed out on it about one run in ten. The second
 * attempt cleared storage, the course list came back in another order, and it
 * passed, which is why it looked like a flake. The course at the top of the
 * picker is not the same from run to run, so neither is the first dot point.
 *
 * So this takes the first option that is enabled, and when a dot point has none,
 * closes the question list and takes the next dot point.
 */
const pickOpenableQuestion = async (page: Page): Promise<void> => {
  const questionTrigger = pickerNamed(page, 'Select Question...');

  for (let index = 0; index < DOT_POINTS_TO_TRY; index++) {
    // The dot point may already be taken (the app selects the first one for a
    // path that stops short of it), so the picker is found by position, not label.
    const dotPointTrigger = await dotPointPicker(page);
    if (!(await openPicker(page, dotPointTrigger))) {
      await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 10_000 });
    }
    await page.getByRole('option').nth(index).click({ timeout: 30_000 });

    if (await openPicker(page, questionTrigger)) {
      const selectable = page.getByRole('option', { disabled: false });
      if (await selectable.count()) {
        await selectable.first().click({ timeout: 30_000 });
        return;
      }
    }
    // Nothing here this account can open: close the list before the next dot point.
    await page.keyboard.press('Escape').catch(() => {});
  }
  throw new Error(
    `none of the first ${DOT_POINTS_TO_TRY} dot points in the picker has a question this account can open`
  );
};

/**
 * The dot-point picker: the nearest picker above the question picker, skipping
 * the focus refinement that can sit between the two. Before a dot point is taken
 * there is no question picker yet, so the dot-point picker is the last one. Its
 * own label changes as soon as a dot point is taken, so the position is what
 * stays put.
 */
const dotPointPicker = async (page: Page): Promise<Locator> => {
  const pickers = page.locator('button[aria-haspopup="listbox"]');
  const labels = await pickers.allTextContents();
  const question = labels.findIndex((label) => label.includes('Select Question...'));
  const above = question < 0 ? labels.length : question;
  for (let i = above - 1; i >= 0; i--) {
    if (!labels[i].includes('Refine Scope...')) return pickers.nth(i);
  }
  throw new Error('no dot-point picker on the page');
};

/**
 * Walk the syllabus picker down to a question this account can open, taking the
 * first option at each level that is open to it. Deliberately data-agnostic: the
 * bundled curriculum can change without this needing to know any ids.
 */
export const openFirstQuestion = async (page: Page): Promise<void> => {
  for (const placeholder of ['Select Course...', 'Select Topic...', 'Select Sub-Topic...']) {
    const trigger = pickerNamed(page, placeholder);
    if (!(await trigger.count())) continue; // already chosen for us
    if (!(await openPicker(page, trigger))) {
      // Still nothing after the re-opens: wait with the message that names it.
      await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 10_000 });
    }
    await page.getByRole('option').first().click({ timeout: 30_000 });
  }
  await pickOpenableQuestion(page);
  await expect(page.getByRole('heading', { name: /Writing Prompt/i })).toBeVisible({
    timeout: 20_000,
  });
  await settleVerbRibbon(page);
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

/**
 * Put a draft in the editor.
 *
 * This exists because of what the contrast sweep could not see. The suite
 * opened a question and measured, which is one screen in ONE state — and three
 * of the surfaces carrying the app's remaining opacity-dimmed text are on that
 * very screen, invisible only because the state they need was never reached.
 * `DraftCheck` is the clearest case: it is mounted in
 * `WorkspaceRightPanel` whenever the session is not an exam, and
 * `buildWritingInsights` returns an empty array at `wordCount === 0`, so the
 * panel returns `null` and never paints. A single word is the whole difference
 * between covered and uncovered.
 *
 * Long enough to trip more than one insight, so the panel has both a warning
 * and a positive tone in it rather than whichever one a two-word draft happens
 * to produce.
 */
export const typeAnswer = async (page: Page, text?: string): Promise<void> => {
  const editor = page.locator('textarea').first();
  await editor.waitFor({ state: 'visible', timeout: 20_000 });
  await editor.fill(
    text ??
      'A data packet travels from the application layer down through the ' +
        'transport layer, where it is segmented and given a port number. The ' +
        'network layer then adds addressing so routers can forward it. Each ' +
        'layer adds its own header, and the receiving host reverses the ' +
        'process on the way back up.'
  );
  // The metrics hook reads a debounced copy of the answer, so the panel
  // appears a beat after the last keystroke rather than with it.
  await expect(page.getByText('Draft check')).toBeVisible({ timeout: 20_000 });
};

/**
 * Expand a collapsed reference panel by its visible name.
 *
 * The workspace's panels are disclosure buttons that keep their content
 * mounted-but-shut, and a checker that walks text nodes cannot see a panel
 * whose content has never been opened — the same blind spot that kept the verb
 * ribbon out of this suite until `openVerbRibbon` existed. `SampleAnswersAccordion`
 * and `DraftCheck` both hold dimmed text behind their own toggle.
 *
 * Idempotent: already-open panels are left alone rather than shut.
 *
 * A PANEL THAT IS NOT THERE IS AN ERROR, NOT A SKIP. This used to `return`
 * quietly when the name matched nothing, and that quiet return cost the suite
 * a whole state: "Live Insights" was renamed to "Draft check" and the contrast
 * sweep went on passing while measuring one panel fewer — the exact failure
 * the light-theme spec's own header warns about, green partly by never having
 * seen the component. The `readings.length > 20` floor did not catch it either,
 * because it counts the whole page and one panel's handful of nodes does not
 * move it.
 */
export const openPanel = async (page: Page, name: RegExp): Promise<void> => {
  // DISCLOSURES ONLY, and that is the whole selector. `getByRole('button')`
  // matched by accessible name across the entire page and took `.first()` in
  // DOM order, which is not the same question as "which panel is this". Asking
  // for /syllabus terms/ found the question card's "Syllabus terms to weave
  // in" label — a button, earlier in the tree, and not a panel — and the helper
  // then waited for an `aria-expanded` it was never going to have.
  //
  // Requiring the attribute also waits out the resting case for free:
  // `DraftCheck` sits on a blank draft with no `aria-expanded` at all, because
  // there is nothing behind it yet, and only becomes a disclosure once the
  // debounced analysis gives it something to say.
  const toggle = page.locator('button[aria-expanded]').filter({ hasText: name }).first();
  await expect(
    toggle,
    `no OPEN-ABLE panel matching ${name} — it was renamed, it does not render in ` +
      `this state, or it is resting with nothing behind it`
  ).toHaveCount(1);

  if ((await toggle.getAttribute('aria-expanded')) === 'false') {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // Same 500ms disclosure transition the ribbon uses; a reading taken
  // mid-animation is a reading of a half-height panel.
  await page.waitForTimeout(700);
};

/**
 * Unfold the syllabus navigator back out of its breadcrumb.
 *
 * Choosing a question folds it away, so every spec that opens a question has
 * been measuring the app with `PromptSelector` — 900 lines of it, and the
 * component holding two of the opacity-dimmed rows this suite exists to catch
 * — collapsed to nothing.
 */
export const expandNavigator = async (page: Page): Promise<void> => {
  const expand = page.getByRole('button', { name: /change|expand/i }).first();
  if (!(await expand.count())) return;
  await expand.click();
  await expect(page.locator('button[aria-haspopup="listbox"]').first()).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(700);
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

/**
 * Walk on until the selected question links at least one syllabus outcome.
 *
 * `openFirstQuestion` takes the first option at every level, and in the
 * bundled curriculum that can land on a question with no linked outcomes
 * — so `ReferenceMaterials`' "What's Assessed" panel, which renders only when
 * `linkedOutcomes.length > 0`, is simply not in the DOM.
 *
 * That mattered quietly for a long time: the contrast sweep's "reference
 * panels open" state asked for that panel, `openPanel` returned without
 * finding it, and the state went on passing while measuring only the panel
 * beside it. Nineteen questions in the bundled data do link outcomes; this
 * finds one.
 */
export const openQuestionWithOutcomes = async (page: Page): Promise<void> => {
  const marker = page.getByRole('button', { name: /Read before you write/i });
  const reopen = page.getByTitle(/Open the syllabus navigator/i);

  // The label is drawn only once the course's outcome list has loaded, and that
  // lags the first question by a second or two. Checking once, with no wait, and
  // then walking the whole syllabus is how a question that already links
  // outcomes was missed on a first run, so the label gets its moment first.
  const shown = (ms: number) =>
    marker
      .first()
      .waitFor({ state: 'visible', timeout: ms })
      .then(
        () => true,
        () => false
      );
  if (await shown(15_000)) return;

  for (let dotPoint = 1; dotPoint < 10; dotPoint += 1) {
    if (await marker.count()) return;

    await reopen.click({ timeout: 10_000 });
    await page.waitForTimeout(600);

    // The dot-point picker is the second-last combobox; the question is last.
    const pickers = page.locator('button[aria-haspopup="listbox"]');
    const dotPicker = pickers.nth((await pickers.count()) - 2);
    await dotPicker.scrollIntoViewIfNeeded();
    await dotPicker.click();

    const options = page.getByRole('option');
    await options.first().waitFor({ state: 'visible', timeout: 8_000 });
    if ((await options.count()) <= dotPoint) break;
    await options.nth(dotPoint).click();
    await page.waitForTimeout(700);

    // Choosing a dot point clears the question, so take its first.
    const questionPicker = page.locator('button[aria-haspopup="listbox"]').last();
    await questionPicker.click();
    const questions = page.getByRole('option');
    await questions.first().waitFor({ state: 'visible', timeout: 8_000 });
    await questions.first().click();
    if (await shown(3_000)) return;
  }

  await expect(
    marker,
    'no question in the bundled curriculum linked an outcome — the "What\'s Assessed" ' +
      'panel cannot be reached, so any state asking for it is measuring nothing'
  ).toHaveCount(1);
};
