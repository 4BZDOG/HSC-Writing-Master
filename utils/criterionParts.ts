import { isCriterionOpener } from './markingGuideLadder';

/**
 * A marking-guide row's criterion, in the parts NESA prints it in.
 *
 * NESA sets a row as bullet points, with "OR" on a line of its own between two
 * ways of reaching the same mark:
 *
 *   • Outlines ONE way to minimise load time
 *   OR
 *   • Identifies TWO ways to minimise load time
 *
 * The seed holds a row on one line ("…load time OR Identifies TWO ways…", with
 * "; " between the points of one alternative), so drawn as written the two
 * alternatives ran on as one sentence. This splits them back out.
 *
 * An "OR" only divides the row when the word after it opens a criterion, a verb
 * in the third person ("OR Identifies", "OR classifies"). "ONE OR TWO elements",
 * "AND/OR" and "OR the system" stay inside their sentence.
 */
export type CriterionParts = string[][];

/** Words that end in "s" and are capitalised like a verb but never open a criterion. */
const NOT_OPENERS = new Set(['Its', 'This', 'His', 'Has', 'Was', 'Is', 'As', 'Us', 'Thus']);

const opensCriterion = (word: string): boolean => {
  const bare = word.replace(/[^A-Za-z]/g, '');
  if (!bare) return false;
  const capitalised = bare.charAt(0).toUpperCase() + bare.slice(1).toLowerCase();
  return !NOT_OPENERS.has(capitalised) && isCriterionOpener(capitalised);
};

/** Alternatives, each a list of points. A plain criterion is `[[text]]`. */
export const criterionParts = (text: string): CriterionParts => {
  const alternatives: string[] = [];
  const rest = text.trim();
  const OR = /,?\s+OR\s+(\S+)/g;
  let start = 0;
  for (let m = OR.exec(rest); m; m = OR.exec(rest)) {
    if (opensCriterion(m[1])) {
      alternatives.push(rest.slice(start, m.index));
      start = m.index + m[0].length - m[1].length;
    }
  }
  alternatives.push(rest.slice(start));
  return alternatives
    .map((alt) =>
      alt
        .split(/\s*;\s+/)
        .map((point) => point.trim().replace(/[;,]$/, '').trim())
        .filter(Boolean)
        // A lower-case opener after "OR" reads as a new bullet, so it takes a capital.
        .map((point) => point.charAt(0).toUpperCase() + point.slice(1))
    )
    .filter((points) => points.length > 0);
};
