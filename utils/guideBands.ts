import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import type { PromptVerb } from '../types';

/**
 * The bands of a question whose marking guide is written in mark ranges.
 *
 * NESA writes an extended response's guide as rows of ranges (17-20, 13-16, 9-12,
 * 5-8, 1-4), each row one level of performance. `getBandForMark` reads a band off
 * the marks alone (ceil(mark × ceiling / total)), and the guide's rows were labelled
 * by the band of their TOP mark, so wherever a row straddled two bands the two
 * disagreed: on an 8-mark EXPLAIN the 5-6 row read Band 3 while a 5/8 exemplar
 * beside it read Band 2. The marking guide, the exemplars and the feedback each
 * told the student a different band for the same answer.
 *
 * So on a guide written in ranges a mark takes the band of the row it falls in, the
 * band that row is labelled with (its top mark's). A 20-mark DISCUSS then reads
 * NESA's five rows as Bands 5 to 1, one to a row, and every exemplar, the guide
 * and the feedback name the same band for the same answer. For the app's own
 * rubrics, whose rows are built one per band from `bandMarkRanges`, this changes
 * nothing. A guide that is not a clean ladder of ranges (per-mark rows,
 * band-labelled rows, gaps or overlaps) falls back to `getBandForMark`.
 */

export interface GuideRow {
  lo: number;
  hi: number;
}

const ROW_START = /^\s*[-•*|]?\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*(?:marks?)?\s*[:|.)–-]/i;
const BAND_ROW = /^\s*[-•*|]?\s*band\s+\d/i;

/**
 * The guide's rows as mark ranges, highest first, or null when it is not a clean
 * ladder with at least one range row.
 */
export const rangedGuideRows = (criteria: string | undefined): GuideRow[] | null => {
  if (!criteria?.trim()) return null;
  const rows: GuideRow[] = [];
  for (const line of criteria.split('\n')) {
    if (BAND_ROW.test(line)) return null;
    const m = line.match(ROW_START);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    rows.push({ lo: Math.min(a, b), hi: Math.max(a, b) });
  }
  return asRangedLadder(rows);
};

/**
 * Rows as a ranged ladder, highest first, or null unless there are at least two,
 * at least one spans a range, and each ends exactly one mark below the one above
 * (no gap, no overlap).
 */
export const asRangedLadder = (rows: GuideRow[]): GuideRow[] | null => {
  if (rows.length < 2 || !rows.some((r) => r.hi > r.lo)) return null;
  const sorted = [...rows].sort((x, y) => y.hi - x.hi);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].hi !== sorted[i - 1].lo - 1) return null;
  }
  return sorted;
};

/**
 * The band of each row of a ranged guide, highest first: the band of the row's top
 * mark, as the Marking Guide panel has always labelled it.
 */
export const rowBands = (rows: GuideRow[], totalMarks: number, tier: number): number[] =>
  rows.map((r) => getBandForMark(r.hi, totalMarks, tier));

/** The band a mark earns on a ranged guide, or null when the mark is in no row. */
export const bandOnRows = (
  rows: GuideRow[],
  mark: number,
  totalMarks: number,
  tier: number
): number | null => {
  const i = rows.findIndex((r) => mark >= r.lo && mark <= r.hi);
  return i < 0 ? null : rowBands(rows, totalMarks, tier)[i];
};

export interface BandedPrompt {
  totalMarks: number;
  verb?: PromptVerb | string;
  markingCriteria?: string;
}

const rowsCache = new Map<string, GuideRow[] | null>();
const cachedRows = (criteria: string | undefined): GuideRow[] | null => {
  const key = criteria ?? '';
  if (!rowsCache.has(key)) {
    if (rowsCache.size > 500) rowsCache.clear();
    rowsCache.set(key, rangedGuideRows(key));
  }
  return rowsCache.get(key)!;
};

/**
 * The band a mark earns on THIS question: from its guide's rows when the guide is
 * a ladder of ranges, otherwise from `getBandForMark`. The one call every surface
 * that has the question in hand should make (exemplars, the guide, feedback).
 */
export const promptBandForMark = (prompt: BandedPrompt, mark: number): number =>
  bandOnGuide(
    mark,
    prompt.totalMarks,
    getCommandTermInfo(prompt.verb as PromptVerb).tier,
    prompt.markingCriteria
  );

/** `promptBandForMark` for a caller that holds the tier rather than the verb. */
export const bandOnGuide = (
  mark: number,
  totalMarks: number,
  tier: number,
  markingCriteria: string | undefined
): number => {
  if (mark <= 0 || totalMarks <= 0) return getBandForMark(mark, totalMarks, tier);
  const rows = cachedRows(markingCriteria);
  const onRows = rows ? bandOnRows(rows, Math.min(mark, totalMarks), totalMarks, tier) : null;
  return onRows ?? getBandForMark(mark, totalMarks, tier);
};
