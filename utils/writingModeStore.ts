import type { WritingMode } from '../types';

/**
 * The writing mode the student chose, remembered for this browser tab.
 *
 * Exam Mode is a sitting, and a reload in the middle of one should come back to
 * it, not to Coach Mode with every aid switched on. sessionStorage is the right
 * home for that: it lasts as long as the tab, so a reload keeps the sitting, and
 * a new tab or a closed window starts in Coach as it always has.
 *
 * Only the mode is stored, not the question: the mode has never been tied to a
 * question, so it carries across them as it always has. Every access is
 * guarded. A blocked or full store leaves the app in Coach Mode, which is the
 * default and loses nothing.
 */

export const WRITING_MODE_KEY = 'hsc.writingMode';

/** The stored mode, or Coach when nothing (or nothing usable) is stored. */
export const readStoredWritingMode = (): WritingMode => {
  try {
    return window.sessionStorage.getItem(WRITING_MODE_KEY) === 'exam' ? 'exam' : 'coach';
  } catch {
    return 'coach';
  }
};

/** Remember Exam Mode for this tab. Coach is the default, so it is simply not stored. */
export const writeStoredWritingMode = (mode: WritingMode): void => {
  try {
    if (mode === 'exam') window.sessionStorage.setItem(WRITING_MODE_KEY, 'exam');
    else window.sessionStorage.removeItem(WRITING_MODE_KEY);
  } catch {
    // Unavailable storage: the choice is not remembered this time.
  }
};
