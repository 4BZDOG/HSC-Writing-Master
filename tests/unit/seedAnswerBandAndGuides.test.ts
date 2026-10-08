import { describe, it, expect } from 'vitest';
import { getFullMarkWordRange, commandTermsList } from '../../data/commandTerms';
import { guideLadderProblem } from '../../utils/markingGuideLadder';
import { shippedCourses, questionsOf } from './support/shippedCourseData';

/**
 * Two things a student or the marker meets in every shipped question, held in
 * place for every course.
 *
 * - A full-mark exemplar is a model of what a full-mark answer looks like, and
 *   a brief answer that meets the top row of the marking criteria is preferred.
 *   The app's word band for the mark value (`getFullMarkWordRange`) is the
 *   ceiling. It is read from the code, so tuning the band after testing moves
 *   this test with it. `LENGTH_TOLERANCE` is the one knob here if the content
 *   needs a grace margin while the band is being tuned.
 * - A marking guide has exactly the rows the app expects for the question's
 *   marks and verb tier, top row first. Guides written against a stale tier
 *   table once failed this in about ninety questions.
 */

const LENGTH_TOLERANCE = 1.0;

const tierOf = new Map(commandTermsList.map((t) => [t.term, t.tier]));
const words = (s: unknown) =>
  String(s ?? '')
    .split(/\s+/)
    .filter(Boolean).length;

const questions = shippedCourses()
  .filter((c) => !c.isTopicFile)
  .flatMap((c) => questionsOf(c));

describe('shipped questions', () => {
  it('walks every course', () => {
    expect(questions.length).toBeGreaterThan(1500);
  });

  it('keeps each full-mark exemplar inside the app word band', () => {
    const over: string[] = [];
    for (const q of questions) {
      const total = q.prompt.totalMarks as number;
      const full = (q.prompt.sampleAnswers ?? []).find((s: { mark: number }) => s.mark === total);
      if (!full) continue;
      const [, max] = getFullMarkWordRange(total);
      const n = words(full.answer);
      if (n > max * LENGTH_TOLERANCE) over.push(`${q.prompt.id}: ${n} words > ${max} (${total}m)`);
    }
    expect(over.slice(0, 10)).toEqual([]);
  });

  it('keeps lower-mark samples no longer than higher-mark ones', () => {
    const bad: string[] = [];
    for (const q of questions) {
      const sa = [...(q.prompt.sampleAnswers ?? [])].sort(
        (a: { mark: number }, b: { mark: number }) => b.mark - a.mark
      );
      for (let i = 1; i < sa.length; i++)
        if (words(sa[i].answer) > words(sa[i - 1].answer))
          bad.push(`${q.prompt.id}: ${sa[i].mark}m longer than ${sa[i - 1].mark}m`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('gives every marking guide the exact rows the app expects', () => {
    const bad: string[] = [];
    for (const q of questions) {
      const tier = tierOf.get(q.prompt.verb) ?? 4;
      const problem = guideLadderProblem(
        String(q.prompt.markingCriteria ?? ''),
        q.prompt.totalMarks,
        tier
      );
      if (problem) bad.push(`${q.prompt.id}: ${problem}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
