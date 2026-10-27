import { test, expect, Locator, Page } from '@playwright/test';
import { clearOnboarding, signIn } from './support/workspace';

/**
 * The Past HSC filter in the syllabus navigator, as a student meets it.
 *
 * The unit tests pin the counts and the predicates; this checks that the
 * switch, the year chips and the pickers agree with each other in a real
 * browser, and that every question the filtered list shows is one the chosen
 * year actually set. Runs on the mock-mode server, where the demo student's
 * Business Studies data is bundled.
 *
 * Business Studies is the course because it has past papers for every year
 * (the 2024 paper alone gives three of Operations' six sub-topics a question).
 * Every topic carries past papers in every year, so the TOPIC list does not
 * shrink for this course; what shrinks is the list one level down, and the
 * topic rows instead say how many past papers each holds.
 */

const COURSE = 'HSC Business Studies';
const COURSE_ID = 'course-hsc-business-studies';
const YEAR = '2024';

/** The picker trigger that still shows its placeholder, so each step is found in order. */
const pickerWithPlaceholder = (page: Page, placeholder: string): Locator =>
  page.locator('button[aria-haspopup="listbox"]', { hasText: placeholder });

/** Opens a picker, waits for its options and returns them. */
const openPicker = async (page: Page, trigger: Locator): Promise<Locator> => {
  // Bounded at 30 s: WebKit settles these slowly on a loaded runner, and a
  // shorter bound fails a click that would have landed.
  await trigger.first().click({ timeout: 30_000 });
  const options = page.getByRole('option');
  await options.first().waitFor({ state: 'visible', timeout: 30_000 });
  return options;
};

const closePicker = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0, { timeout: 15_000 });
};

const pastHscSwitch = (page: Page): Locator =>
  page.getByRole('button', { name: 'Past HSC', exact: true });

const yearGroup = (page: Page): Locator => page.getByRole('group', { name: 'Years' });

/**
 * Stores a navigator state for Business Studies before the app loads, the way
 * an earlier visit would have left it. The app reads it on first render.
 */
const seedNavigator = async (page: Page, years: number[]): Promise<void> => {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [`hsc.pastHscNavigator.${COURSE_ID}`, JSON.stringify({ on: true, years })]
  );
};

/** Signs in, clears onboarding and selects Business Studies, leaving the navigator as seeded. */
const openBusinessStudies = async (page: Page): Promise<void> => {
  await signIn(page, 'user');
  await clearOnboarding(page);
  await openPicker(page, page.locator('button[aria-haspopup="listbox"]').first());
  await page.getByRole('option', { name: COURSE, exact: true }).click({ timeout: 30_000 });
};

test.describe('past HSC navigator filter', () => {
  test.describe.configure({ timeout: 180_000 });

  test('narrows the syllabus to one year and holds every question to it', async ({ page }) => {
    await signIn(page, 'user');
    await clearOnboarding(page);

    // Business Studies. The course picker is the first picker in the navigator.
    await openPicker(page, page.locator('button[aria-haspopup="listbox"]').first());
    await page.getByRole('option', { name: COURSE, exact: true }).click({ timeout: 30_000 });

    // The switch appears once the course has past papers. Off to start with.
    await expect(pastHscSwitch(page)).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });
    await expect(yearGroup(page)).toHaveCount(0);

    const topicsOff = await openPicker(page, pickerWithPlaceholder(page, 'Select topic'));
    await expect(topicsOff).toHaveCount(4);
    await expect(page.getByRole('option', { name: /past HSC/ })).toHaveCount(0);
    await closePicker(page);

    // Switch it on. Every topic now says how many past papers it holds.
    await pastHscSwitch(page).click({ timeout: 30_000 });
    await expect(pastHscSwitch(page)).toHaveAttribute('aria-pressed', 'true');

    const topicsOn = await openPicker(page, pickerWithPlaceholder(page, 'Select topic'));
    await expect(topicsOn).toHaveCount(4);
    await expect(page.getByRole('option', { name: /\d+ past HSC/ })).toHaveCount(4);
    await closePicker(page);

    // Year chips: "All years", then the years newest first, so 2025 sits beside it.
    const chips = await yearGroup(page).getByRole('button').allInnerTexts();
    expect(chips[0]).toBe('All years');
    const years = chips.slice(1).map((c) => Number(c));
    expect(years.length).toBeGreaterThan(1);
    expect(years).toEqual([...years].sort((a, b) => b - a));

    await yearGroup(page)
      .getByRole('button', { name: YEAR, exact: true })
      .click({ timeout: 30_000 });
    await expect(yearGroup(page).getByRole('button', { name: YEAR, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Topic: Operations holds three 2024 papers in the bundled data.
    const topicsIn2024 = await openPicker(page, pickerWithPlaceholder(page, 'Select topic'));
    await expect(topicsIn2024.filter({ hasText: /Operations/ })).toContainText('3 past HSC');
    await topicsIn2024
      .filter({ hasText: /^Operations/ })
      .first()
      .click({ timeout: 30_000 });

    // Sub-topic: the list shrinks from six to the three that hold a 2024 paper.
    const subTopics = await openPicker(page, pickerWithPlaceholder(page, 'Select sub-topic'));
    await expect(subTopics).toHaveCount(3);
    await expect(page.getByRole('option', { name: /past HSC/ })).toHaveCount(3);
    // Once chosen, the trigger shows the sub-topic's name; keep a prefix of it
    // to find the trigger again when the filter is switched off.
    const subTopicPrefix = (await subTopics.first().innerText()).trim().slice(0, 20);
    await subTopics.first().click({ timeout: 30_000 });

    // Syllabus point, then the question list under it.
    await openPicker(page, pickerWithPlaceholder(page, 'Select syllabus point'));
    await page.getByRole('option').first().click({ timeout: 30_000 });

    const questionsOn = await openPicker(page, pickerWithPlaceholder(page, 'Select question'));
    const onTexts = await questionsOn.allInnerTexts();
    expect(onTexts.length).toBeGreaterThan(0);
    // Every question the filter lists carries a past-HSC chip for the chosen year.
    for (const text of onTexts) {
      expect(text, `question without a ${YEAR} past-HSC chip: ${text}`).toMatch(
        new RegExp(`HSC ${YEAR}\\b`)
      );
    }
    await closePicker(page);

    // Switch the filter off. The years go, the topic counts go, and the
    // question list is no longer held to 2024.
    await pastHscSwitch(page).click({ timeout: 30_000 });
    await expect(pastHscSwitch(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(yearGroup(page)).toHaveCount(0);
    await expect(page.getByRole('option', { name: /past HSC/ })).toHaveCount(0, {
      timeout: 15_000,
    });

    const topicsRestored = await openPicker(page, pickerWithPlaceholder(page, 'Operations'));
    await expect(topicsRestored).toHaveCount(4);
    await closePicker(page);

    const subTopicsRestored = await openPicker(page, pickerWithPlaceholder(page, subTopicPrefix));
    await expect(subTopicsRestored).toHaveCount(6);
    await closePicker(page);

    // No question was chosen, so the picker still shows its placeholder.
    const questionsOff = await openPicker(page, pickerWithPlaceholder(page, 'Select question'));
    const offTexts = await questionsOff.allInnerTexts();
    expect(offTexts.length).toBeGreaterThan(onTexts.length);
    expect(offTexts.some((text) => !/HSC \d{4}/.test(text))).toBe(true);
    await closePicker(page);
  });

  test('names a saved year this course does not have, and applies the rest', async ({ page }) => {
    // 2018 is not in the bundled Business Studies past papers; 2024 is.
    await seedNavigator(page, [2018, 2024]);
    await openBusinessStudies(page);

    await expect(pastHscSwitch(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    await expect(
      page.getByText("2018 isn't in this course's past papers, so it isn't applied.", {
        exact: true,
      })
    ).toBeVisible({ timeout: 30_000 });
    // The year that does exist is still the one applied.
    await expect(yearGroup(page).getByRole('button', { name: YEAR, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(
      yearGroup(page).getByRole('button', { name: 'All years', exact: true })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  test('says all years are shown when no saved year is in this course', async ({ page }) => {
    await seedNavigator(page, [2018]);
    await openBusinessStudies(page);

    await expect(pastHscSwitch(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    await expect(
      page.getByText("2018 isn't in this course's past papers, so all years are shown.", {
        exact: true,
      })
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      yearGroup(page).getByRole('button', { name: 'All years', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
