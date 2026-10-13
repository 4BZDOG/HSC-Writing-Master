import { describe, it, expect } from 'vitest';
import { wordCountsLine, wordsKeptLine } from '../../utils/diffSummary';
import { diffWords, summariseDiff } from '../../utils/textDiff';

/**
 * The summary strip above a revision, worded once. The screen and the printed
 * report both build their line from these, so a student cannot read one figure
 * on paper and another on screen.
 */
describe('the words of the revision summary', () => {
  it('states the share of the original’s words the revision keeps', () => {
    // Three of four original words survive, and one is replaced.
    const stats = summariseDiff(diffWords('a b c d', 'a b c e'));

    expect(wordsKeptLine(stats)).toBe('75% of your words kept');
  });

  it('rounds the share to a whole percent', () => {
    const stats = summariseDiff(diffWords('a b c', 'a b c d e'));

    expect(wordsKeptLine(stats)).toBe('100% of your words kept');
  });

  it('gives the count before and after the revision', () => {
    const stats = summariseDiff(diffWords('a b c d', 'a b c e f'));

    expect(wordCountsLine(stats)).toBe('4 → 5 words');
  });
});
