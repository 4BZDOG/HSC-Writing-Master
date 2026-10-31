import { describe, it, expect } from 'vitest';
import { getFullMarkWordRange, commandTermsList, getPromptTermInfo } from '../../data/commandTerms';
import { guideLadderProblem, guideStructureProblem } from '../../utils/markingGuideLadder';
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
 *   marks and verb tier, top row first. A past paper's guide is NESA's own ladder
 *   and need only be a well-formed one. Guides written against a stale tier
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
      // A verified past-HSC exemplar is what a student wrote in the exam (NESA's
      // published full-mark samples run past the band); the band is the target
      // for the exemplars the app writes.
      const full = (q.prompt.sampleAnswers ?? []).find(
        (s: { mark: number; source?: string }) => s.mark === total && s.source !== 'HSC_EXEMPLAR'
      );
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
      // One ladder per prescribed text: a question answered on the student's own
      // text holds a full ladder for each text, and a 12-mark answer on one novel
      // is not measured against a 20-mark answer on another.
      const ladders = new Map<string, { mark: number; answer: string }[]>();
      for (const a of q.prompt.sampleAnswers ?? []) {
        const key = a.prescribedText ?? '';
        ladders.set(key, [...(ladders.get(key) ?? []), a]);
      }
      for (const [text, ladder] of ladders) {
        const sa = ladder.sort((a, b) => b.mark - a.mark);
        for (let i = 1; i < sa.length; i++)
          if (sa[i].mark < sa[i - 1].mark && words(sa[i].answer) > words(sa[i - 1].answer))
            bad.push(
              `${q.prompt.id}${text ? ` (${text})` : ''}: ${sa[i].mark}m longer than ${sa[i - 1].mark}m`
            );
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  // Highest mark first, as the marking guide is written. Exemplars on a named
  // prescribed text hold one ladder per text and are grouped by it instead.
  it('lists each question’s exemplars highest mark first', () => {
    const bad = questions
      .filter((q) => !(q.prompt.sampleAnswers ?? []).some((a) => a.prescribedText))
      .filter((q) => {
        const marks = (q.prompt.sampleAnswers ?? []).map((a) => a.mark);
        return marks.some((m, i) => i > 0 && m > marks[i - 1]);
      })
      .map((q) => q.prompt.id);
    expect(bad).toEqual([]);
  });

  it('gives every marking guide the exact rows the app expects', () => {
    const bad: string[] = [];
    for (const q of questions) {
      const tier = getPromptTermInfo(q.prompt).tier;
      const guide = String(q.prompt.markingCriteria ?? '');
      // A past paper's guide is NESA's own ladder; it is held to being a sound
      // ladder, not to the app's rows (see `guideStructureProblem`).
      const problem = q.prompt.isPastHSC
        ? guideStructureProblem(guide, q.prompt.totalMarks)
        : guideLadderProblem(guide, q.prompt.totalMarks, tier);
      if (problem) bad.push(`${q.prompt.id}: ${problem}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});
