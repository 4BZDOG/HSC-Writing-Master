/**
 * Focus Mode's layout: how tall the question card may be beside the writing
 * card, and whether its scenario is open. Kept apart from the components so the
 * storage and the clamping are plain functions the tests can pin.
 *
 * Both preferences are per-browser conveniences, not records. Every storage
 * access is wrapped: a private window, blocked site data or a full quota must
 * leave the layout working on its defaults rather than throw.
 */

export const FOCUS_SCENARIO_KEY = 'hsc.focus.scenarioOpen';
export const FOCUS_PROMPT_HEIGHT_KEY = 'hsc.focus.promptHeight';

/** The smallest the question card can be dragged: its header plus a line or two of body. */
export const FOCUS_PROMPT_MIN = 150;

/**
 * The shortest the writing card may be. Below this the writing well is too small
 * to be worth the name, so the question gives way (its body scrolls) before the
 * writing area is squeezed any further.
 */
export const FOCUS_WRITING_CARD_MIN = 420;

/**
 * Everything Focus Mode stacks above and below the two cards: the exit pill and
 * the page padding above, the splitter's own row, and the card's bottom margin.
 */
export const FOCUS_CHROME_RESERVE = 130;

/**
 * The width from which Focus Mode sizes the two cards to the window (Tailwind's
 * `sm`). Below it the page scrolls and the cards keep their own content height.
 */
export const FOCUS_FILL_MIN_WIDTH = 640;

/** A keyboard step on the splitter, in CSS pixels. */
export const FOCUS_SPLIT_STEP = 24;

/** The largest the question card may be on a window this tall. */
export const maxFocusPromptHeight = (viewportHeight: number): number =>
  Math.max(FOCUS_PROMPT_MIN, viewportHeight - FOCUS_CHROME_RESERVE - FOCUS_WRITING_CARD_MIN);

/** The same ceiling as a CSS length, so the cap follows a window resize in the same frame. */
export const FOCUS_PROMPT_MAX_CSS = `calc(100dvh - ${FOCUS_CHROME_RESERVE + FOCUS_WRITING_CARD_MIN}px)`;

/**
 * The writing card's floor in Focus Mode: whatever the window has left under the
 * question card (measured, `promptPx`), and never less than the card's own
 * minimum. A floor rather than a fixed height, so the page keeps its normal flow:
 * the draft check and the reference panels follow the card and the page scrolls
 * to them, as it does everywhere else.
 */
export const focusWritingCardMinHeight = (promptPx: number): string =>
  `max(${FOCUS_WRITING_CARD_MIN}px, calc(100dvh - ${Math.round(promptPx) + FOCUS_CHROME_RESERVE}px))`;

/** Clamp a requested question-card height into the range the splitter allows. */
export const clampFocusPromptHeight = (px: number, viewportHeight: number): number =>
  Math.round(Math.min(Math.max(px, FOCUS_PROMPT_MIN), maxFocusPromptHeight(viewportHeight)));

const readItem = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeItem = (key: string, value: string | null): void => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Unavailable storage: the choice simply isn't remembered this time.
  }
};

/** Whether the scenario is open in Focus Mode. Collapsed unless the student has opened it. */
export const readFocusScenarioOpen = (): boolean => readItem(FOCUS_SCENARIO_KEY) === '1';

export const writeFocusScenarioOpen = (open: boolean): void =>
  writeItem(FOCUS_SCENARIO_KEY, open ? '1' : '0');

/** The question card's chosen height in px, or `null` to fit the question. */
export const readFocusPromptHeight = (): number | null => {
  const raw = readItem(FOCUS_PROMPT_HEIGHT_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export const writeFocusPromptHeight = (px: number | null): void =>
  writeItem(FOCUS_PROMPT_HEIGHT_KEY, px === null ? null : String(Math.round(px)));
