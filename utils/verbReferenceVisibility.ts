import type { WritingMode } from '../types';

/**
 * Whether the command verb reference (the "HSC command verb hierarchy" bar) is on
 * screen.
 *
 * It is the verb guide, which is assistance, so Exam Mode puts it away: the same
 * reason the question's verb chip is disabled there. Focus Mode hides it as it
 * always has. Kept as a function so the rule can be tested at this seam, since no
 * test renders the whole App.
 */
export const showsVerbReference = (writingMode: WritingMode, isFocusMode: boolean): boolean =>
  !isFocusMode && writingMode !== 'exam';
