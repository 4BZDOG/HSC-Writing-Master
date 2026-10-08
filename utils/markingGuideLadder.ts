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
  if (!same) return `it has rows for ${describe(actual)}; it needs ${describe(expected)}`;
  return guideStyleProblem(text);
};

/**
 * HSC marking-guideline style.
 *
 * A NESA marking guideline is a short ladder of criteria, highest mark first.
 * Each criterion is a performance descriptor that opens with a verb in the
 * third person ("Provides…", "Demonstrates…", "Identifies…", "Analyses…"), or
 * an adverb on one ("Accurately explains…"), or reads "Correct…" for a worked
 * answer or "Minimal…" for the bottom row. It is never a lower-case fragment,
 * a noun phrase describing an answer ("A clear contrast of…") or a passive
 * description ("one factor is identified").
 *
 * The check is a heuristic on the first word, not grammar: a word that ends in
 * "s" is taken as a verb unless it is plainly a noun ending ("Analysis",
 * "Genetics", "Awareness").
 */
const GUIDE_ROW =
  /^\s*(?:[-*•]\s*)?(?:\*\*)?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*marks?\b[^:\n]*:\s*(.*)$/i;
const NOUN_ENDINGS = /(?:ysis|esis|sis|ics|ness|ous|us|ism|ss)$/i;
const OPENERS = new Set(['Minimal', 'No', 'Nil', 'Correct', 'Nothing']);

export const isCriterionOpener = (word: string): boolean => {
  if (OPENERS.has(word)) return true;
  if (/^[A-Z][a-z]+ly$/.test(word)) return true;
  if (!/^[A-Z][a-z]+s$/.test(word)) return false;
  // "Discusses", "Assesses", "Addresses" end in "ss" but are verbs.
  if (/sses$/.test(word)) return true;
  return !NOUN_ENDINGS.test(word);
};

/** The criterion text of each row, in the order written, with its mark label. */
export const guideRowTexts = (text: string): { label: string; criterion: string }[] =>
  text
    .split('\n')
    .map((line) => line.match(GUIDE_ROW))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({
      label: m[2] ? `${m[1]}-${m[2]}` : m[1],
      criterion: m[3].trim(),
    }));

/**
 * Null when every row is written in HSC marking-guideline style; otherwise a
 * sentence naming the first row that is not and what it should open with.
 */
export const guideStyleProblem = (text: string): string | null => {
  for (const { label, criterion } of guideRowTexts(text)) {
    const first = criterion.split(/\s+/)[0] ?? '';
    if (!isCriterionOpener(first)) {
      return `the ${label}-mark row opens with "${first || '(nothing)'}"; every row must open with a capitalised verb in the third person, as in an HSC marking guideline ("Provides…", "Demonstrates…", "Identifies…")`;
    }
  }
  return null;
};

/**
 * Puts a guide that is already one row per line into canonical shape: highest
 * mark first, a capital letter opening each criterion, bullets and markdown
 * stripped, labels written "N marks:" / "N-M marks:" / "1 mark:". The wording
 * of each criterion is never touched.
 *
 * Anything that is not purely rows — a preamble, a row wrapped over two lines, a
 * table — is returned unchanged, because guessing at the shape of text this
 * function does not understand is how criteria get lost.
 */
export const normaliseGuideRows = (text: string): string => {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return text;
  const rows: { hi: number; label: string; criterion: string }[] = [];
  for (const line of lines) {
    const m = line.match(GUIDE_ROW);
    if (!m) return text;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const label = lo === hi ? `${hi} mark${hi === 1 ? '' : 's'}` : `${lo}-${hi} marks`;
    // NESA criteria are not full sentences, so a closing full stop is dropped.
    const criterion = m[3]
      .trim()
      .replace(/^\*\*|\*\*$/g, '')
      .trim()
      .replace(/\.$/, '')
      .trim();
    if (!criterion) return text;
    rows.push({ hi, label, criterion: criterion.charAt(0).toUpperCase() + criterion.slice(1) });
  }
  rows.sort((x, y) => y.hi - x.hi);
  return rows.map((r) => `${r.label}: ${r.criterion}`).join('\n');
};
