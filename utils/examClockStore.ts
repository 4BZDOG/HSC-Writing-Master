/**
 * The Exam Mode clock, shared between the writing metrics strip (which runs it)
 * and the writing card's footer (which shows a copy of it).
 *
 * The clock is state in WritingMetricsDashboard. Lifting it into the workspace
 * would re-render the whole editor every second, so it is published here instead,
 * and only the small chip that reads it re-renders. The strings are the strip's
 * own, so the two can never disagree.
 *
 * Null whenever there is no exam clock on screen: in Coach Mode, with no strip
 * mounted, or once the question changes.
 */

export interface ExamClockReading {
  /** The figure, as the strip prints it: `05:07`, or `+00:42` when over. */
  text: string;
  /** What the figure is measured against: `left of 6 min`, `over 6 min`. */
  caption: string;
  /** Past the budget, so the figure takes the overrun tone. */
  over: boolean;
}

let current: ExamClockReading | null = null;
const listeners = new Set<() => void>();

const sameReading = (a: ExamClockReading | null, b: ExamClockReading | null): boolean =>
  a === b ||
  (a !== null && b !== null && a.text === b.text && a.caption === b.caption && a.over === b.over);

/** The clock as it stands now, or null when no exam clock is on screen. */
export const getExamClock = (): ExamClockReading | null => current;

/**
 * Publishes a reading. Equal readings are dropped, so a strip that re-publishes
 * on every commit notifies nobody when nothing has changed.
 */
export const publishExamClock = (value: ExamClockReading | null): void => {
  if (sameReading(current, value)) return;
  current = value;
  listeners.forEach((listener) => listener());
};

/** Subscribes to changes; returns the unsubscribe function `useSyncExternalStore` expects. */
export const subscribeExamClock = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
