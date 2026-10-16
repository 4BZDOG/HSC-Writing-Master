/**
 * The workspace's reading size, in px.
 *
 * One number is shared by the question card, the writing surface and the
 * exemplars (Workspace owns it as `promptFontSize`), so the three zoom controls
 * must agree on the range. They used to: the question card allowed 12-48 and
 * the other two 12-32, so a question zoomed to 40 left the writing surface's
 * zoom-in greyed out at a size it was already past. Every control steps and
 * disables through the helpers below, so the limits cannot drift apart again.
 *
 * The top is 48 because the shared value can already reach it from the question
 * card; narrowing it to 32 would have taken a control away rather than aligning
 * the others with it.
 */
export const READING_SIZE_MIN = 12;
export const READING_SIZE_MAX = 48;
export const READING_SIZE_DEFAULT = 18;
export const READING_SIZE_STEP = 2;

/** Pin any value into the reading range. A non-number falls back to the default. */
export const clampReadingSize = (size: number): number => {
  if (!Number.isFinite(size)) return READING_SIZE_DEFAULT;
  return Math.min(READING_SIZE_MAX, Math.max(READING_SIZE_MIN, size));
};

/** The size one step up (`direction` 1) or down (`direction` -1), clamped. */
export const stepReadingSize = (size: number, direction: 1 | -1): number =>
  clampReadingSize(clampReadingSize(size) + direction * READING_SIZE_STEP);

/**
 * Whether a zoom button can do anything. Disabled exactly when a step would
 * leave the size where it is, which is the one rule every control shares.
 */
export const canStepReadingSize = (size: number, direction: 1 | -1): boolean =>
  stepReadingSize(size, direction) !== clampReadingSize(size);
