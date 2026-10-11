import { formatMarkingCriteria } from './dataManagerUtils';
import { getBandForMark, markForBand } from '../data/commandTerms';

/**
 * The marking guide as a ladder: one row per mark level or band, each with the
 * criterion that earns it.
 *
 * This is the pure half of the Marking Guide panel, and it is shared with the
 * Sample Answers panel, which draws the same ladder from the other side (one
 * exemplar per mark). Both panels read the bands from `getBandForMark` and
 * `markForBand` in `data/commandTerms`, never from their own arithmetic, so a
 * guide row and the exemplar beside it cannot disagree about which band a mark
 * earns.
 */

export interface MarkingCriteriaItem {
  markLabel: string;
  markRange: [number, number];
  description: string;
  band: number;
}

const parseMarkRange = (str: string): [number, number] => {
  const numbers = str.match(new RegExp('(\\d+)', 'g'));
  if (!numbers) return [0, 0];
  const nums = numbers.map(Number);
  if (nums.length === 1) return [nums[0], nums[0]];
  return [Math.min(...nums), Math.max(...nums)];
};

/**
 * Parses a stored marking guide into its rows, highest mark first.
 *
 * `tier` is the cognitive tier of the question's command verb. It caps the
 * bands a row can be drawn in, so a band-labelled row snaps onto a band the
 * question can actually award.
 */
export const parseMarkingCriteria = (
  markingCriteria: string,
  totalMarks: number,
  tier: number
): MarkingCriteriaItem[] => {
  const formattedCriteria = formatMarkingCriteria(markingCriteria);
  if (!formattedCriteria) return [];

  const items: MarkingCriteriaItem[] = [];

  // Normalize: strip markdown bold, mid-line bullets → newlines
  let normalizedText = formattedCriteria.replace(/\*\*/g, '');
  normalizedText = normalizedText.replace(/ • /g, '\n- ');

  const lines = normalizedText.split('\n');
  let currentItem: MarkingCriteriaItem | null = null;

  // Regex 1: "[Marks] marks:" or "[Marks]:" at START of line (with optional bullet/pipe prefix)
  // Matches: "5 marks:", "3-4 marks:", "5:", "3–4 marks -", "• 5 marks:", etc.
  const startMarkRegex = new RegExp(
    '^[-•*|]?\\s*(\\d+(?:\\s*[-–]\\s*\\d+)?)\\s*(?:marks?)?\\s*[:|.\\-)]+\\s*(.*)',
    'i'
  );

  // Regex 2: Point breakdown style "Descriptor... ([Mark] mark)" anywhere in
  // line. The third group keeps whatever follows the bracket — a row written
  // as "Band 6 (7-8 marks): Comprehensive analysis…" used to be stored as the
  // words before the bracket alone, silently discarding the actual criteria.
  const endMarkRegex = new RegExp(
    '(.*?)\\((\\d+(?:\\s*[-–]\\s*\\d+)?)\\s*marks?\\)\\s*[:.\\-–]?\\s*(.*)',
    'i'
  );

  // Regex 3: "Band N:" or "Band N-M:" pattern (AI sometimes uses band labels)
  const bandStartRegex = new RegExp(
    '^[-•*]?\\s*band\\s+(\\d+(?:\\s*[-–]\\s*\\d+)?)\\s*[:|.\\-)]+\\s*(.*)',
    'i'
  );

  lines.forEach((line) => {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.match(new RegExp('^[|\\-]+$'))) return;

    const startMatch = cleanLine.match(startMarkRegex);
    const endMatch = cleanLine.match(endMarkRegex);
    const bandMatch = cleanLine.match(bandStartRegex);

    if (startMatch && startMatch[1]) {
      if (currentItem) items.push(currentItem);
      const range = parseMarkRange(startMatch[1].trim());
      currentItem = {
        markLabel: range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`,
        markRange: range,
        description: startMatch[2].trim(),
        band: getBandForMark(range[1], totalMarks, tier),
      };
    } else if (bandMatch) {
      if (currentItem) items.push(currentItem);
      const bandNums = bandMatch[1].match(/\d+/g)?.map(Number) || [1];
      const topBand = Math.max(...bandNums);
      // The mark this band starts at on THIS question — tier-aware, like every
      // other band figure in the app. The old inline `(band / 6) * totalMarks`
      // ignored the verb's ceiling, so a Tier-2 question's rows were placed
      // against marks it can never award.
      const bandMark = markForBand(topBand, totalMarks, tier);
      // Then the band that mark ACTUALLY earns here, which is what both the
      // label and the colour are read from. A question with fewer marks than
      // bands cannot award the bottom of the range — a 4-mark Evaluate runs
      // Band 6 down to Band 3 — so a row an author wrote as "Band 2:" was
      // painting orange at mark 1 while the exemplar at that same mark sat
      // yellow at Band 3. Where the authored band IS reachable this is a
      // no-op and the row keeps the number it was written with.
      const rowBand = getBandForMark(bandMark, totalMarks, tier);
      currentItem = {
        markLabel: `Band ${rowBand}`,
        markRange: [bandMark, bandMark],
        description: bandMatch[2].trim(),
        band: rowBand,
      };
    } else if (endMatch) {
      if (currentItem) items.push(currentItem);
      const range = parseMarkRange(endMatch[2].trim());
      const before = endMatch[1].replace(/^[-•*]\s*/, '').trim();
      const after = (endMatch[3] || '').trim();
      // Prefer the criteria that follow the bracket; fall back to the label
      // before it when the row is written as "Describes both features (2 marks)".
      const desc = after || before;

      // Stays the current item rather than being closed off, so wrapped or
      // continuation lines beneath it are appended instead of dropped.
      currentItem = {
        markLabel: range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`,
        markRange: range,
        description: desc,
        band: getBandForMark(range[1], totalMarks, tier),
      };
    } else if (currentItem) {
      currentItem.description += ' ' + cleanLine;
    }
  });

  if (currentItem) items.push(currentItem);

  return items.sort((a, b) => b.markRange[1] - a.markRange[1]);
};

/**
 * A row written against a band rather than a mark. Its `markRange` is the single
 * mark that band starts at, and its label is "Band N" (see `parseMarkingCriteria`).
 */
export const isBandLabelled = (item: Pick<MarkingCriteriaItem, 'markLabel'>): boolean =>
  item.markLabel.startsWith('Band');

/**
 * The row that holds a given mark, or undefined when no row does.
 *
 * A mark-numbered row holds every mark in its range. A band-labelled row holds
 * the marks that earn its band, so it matches on `band` rather than on its
 * single-mark range. `items` is taken in the order `parseMarkingCriteria`
 * returns (highest first), and the first row that holds the mark wins.
 */
export const criterionForMark = (
  items: MarkingCriteriaItem[],
  mark: number,
  band: number
): MarkingCriteriaItem | undefined =>
  items.find((item) =>
    isBandLabelled(item)
      ? item.band === band
      : mark >= item.markRange[0] && mark <= item.markRange[1]
  );

/**
 * The exemplar a row should open: the highest mark among `sampleAnswers` that
 * the row holds, or undefined when the row has no exemplar.
 *
 * "Holds" follows `criterionForMark`. A mark-numbered row takes exemplars whose
 * mark falls in its range; a band-labelled row takes exemplars whose mark earns
 * its band on this question, by `getBandForMark`.
 */
export const exemplarMarkForItem = (
  item: MarkingCriteriaItem,
  sampleAnswers: { mark: number }[],
  totalMarks: number,
  tier: number
): number | undefined => {
  const bandRow = isBandLabelled(item);
  let best: number | undefined;
  for (const { mark } of sampleAnswers) {
    if (!Number.isFinite(mark)) continue;
    const holds = bandRow
      ? getBandForMark(mark, totalMarks, tier) === item.band
      : mark >= item.markRange[0] && mark <= item.markRange[1];
    if (holds && (best === undefined || mark > best)) best = mark;
  }
  return best;
};
