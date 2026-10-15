import { describe, it, expect } from 'vitest';
import { commandTermsList, getCommandTermInfo, getRecommendedTime } from '../../data/commandTerms';

/**
 * Recommended time follows the verb inside the verb's mark range and the HSC
 * pace (1.8 minutes a mark) beyond it.
 *
 * Exam-length questions are 15-25 marks, past every verb's typical range, so the
 * old clamp gave them the verb's ceiling: 18 minutes for a 20-mark DISCUSS where
 * the paper allows about 35-40.
 */
const minutes = (verb: string, marks: number) =>
  getRecommendedTime(marks, getCommandTermInfo(verb as never)) / 60;

describe('getRecommendedTime', () => {
  it('leaves a question inside its verb range exactly as before', () => {
    for (const term of commandTermsList) {
      const [lo, hi] = term.markRange;
      for (let marks = lo; marks <= hi; marks++) {
        const ratio = hi === lo ? 0.5 : (marks - lo) / (hi - lo);
        const expected = Math.round(
          (hi === lo
            ? (term.timeRange[0] + term.timeRange[1]) / 2
            : term.timeRange[0] + ratio * (term.timeRange[1] - term.timeRange[0])) * 60
        );
        expect(getRecommendedTime(marks, term), `${term.term} ${marks}m`).toBe(expected);
      }
    }
  });

  it('gives an exam-length question the HSC pace, not the verb ceiling', () => {
    expect(minutes('DISCUSS', 20)).toBeCloseTo(36, 0);
    expect(minutes('ASSESS', 20)).toBeCloseTo(36, 0);
    expect(minutes('EXPLAIN', 20)).toBeCloseTo(36, 0);
    expect(minutes('CONSTRUCT', 15)).toBeCloseTo(27, 0);
  });

  it('never gives more marks less time', () => {
    for (const term of commandTermsList) {
      let previous = 0;
      for (let marks = 1; marks <= 25; marks++) {
        const t = getRecommendedTime(marks, term);
        expect(t, `${term.term} ${marks}m`).toBeGreaterThanOrEqual(previous);
        previous = t;
      }
    }
  });
});
