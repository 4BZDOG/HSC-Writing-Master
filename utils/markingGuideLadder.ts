import { bandMarkRanges } from '../data/commandTerms';

/**
 * The rows a generated marking guide must have, and a check that it has them.
 *
 * The rubric brief (`buildMarkingCriteriaInstruction` in services/geminiService)
 * asks for an exact ladder: one row per mark, full marks down to 1, on a
 * question of six marks or fewer; above that, one row per band the question can
 * award, carrying that band's mark range from `bandMarkRanges`. What came back
 * was saved without being read. A guide that started below full marks, skipped
 * a mark or ran upwards went straight into the library — and in a bulk "Write
 * Marking Guides" run from the Content Audit Studio, into dozens of questions at
 * once — where it is the rubric the marker is handed for every answer.
 */

export interface GuideRow {
  lo: number;
  hi: number;
}

/** The rows the brief asks for, top row first. */
export const expectedGuideRows = (totalMarks: number, tier: number): GuideRow[] =>
  totalMarks <= 6
    ? Array.from({ length: Math.max(0, totalMarks) }, (_, i) => ({
        lo: totalMarks - i,
        hi: totalMarks - i,
      }))
    : bandMarkRanges(totalMarks, tier).map(({ lo, hi }) => ({ lo, hi }));

/** "N marks:" or "N-M marks:" at the start of a line, after an optional bullet or bold. */
const ROW = /^\s*(?:[-*•]\s*)?(?:\*\*)?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*marks?\b[^:\n]*:/i;

/** The rows a guide actually has, top row first. */
export const guideRows = (text: string): GuideRow[] =>
  text
    .split('\n')
    .map((line) => line.match(ROW))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => {
      const a = parseInt(m[1], 10);
      const b = m[2] ? parseInt(m[2], 10) : a;
      return { lo: Math.min(a, b), hi: Math.max(a, b) };
    });

const describe = (rows: GuideRow[]): string =>
  rows.length
    ? rows.map(({ lo, hi }) => (lo === hi ? `${lo}` : `${lo}-${hi}`)).join(', ') + ' marks'
    : 'no mark rows';

/**
 * Null when the guide has exactly the rows the brief asked for; otherwise a
 * sentence naming what it has and what it needed, which is both the retry
 * message to the model and the error a curator reads if the retry fails too.
 */
export const guideLadderProblem = (
  text: string,
  totalMarks: number,
  tier: number
): string | null => {
  const expected = expectedGuideRows(totalMarks, tier);
  const actual = guideRows(text);
  const same =
    expected.length === actual.length &&
    expected.every((row, i) => row.lo === actual[i].lo && row.hi === actual[i].hi);
  return same ? null : `it has rows for ${describe(actual)}; it needs ${describe(expected)}`;
};
