import type { CourseOutcome } from '../types';

/**
 * Which rows repeat a code already used above them.
 *
 * A question links to an outcome BY CODE, so two rows sharing one code make
 * every link through it ambiguous — and it is easy to end up with: parse a page
 * twice, paste a list that overlaps one already typed, or copy a row to edit it
 * and forget to change the code. The editors flag the later row rather than
 * silently dropping it, because which of the two the author meant to keep is
 * not something the code can know.
 *
 * Compared case-insensitively and trimmed: "BI-12-01" and "bi-12-01 " are the
 * same outcome to anyone reading them, and to any link that resolves them.
 * Blank codes are not duplicates of each other — they are just unfinished.
 */
export const duplicateCodeRows = (outcomes: CourseOutcome[]): Set<number> => {
  const seen = new Set<string>();
  const repeats = new Set<number>();
  outcomes.forEach((outcome, index) => {
    const key = outcome.code.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) repeats.add(index);
    else seen.add(key);
  });
  return repeats;
};

/** The same list with those later rows removed — what actually gets stored. */
export const withoutDuplicateCodes = (outcomes: CourseOutcome[]): CourseOutcome[] => {
  const repeats = duplicateCodeRows(outcomes);
  return outcomes.filter((_, index) => !repeats.has(index));
};
