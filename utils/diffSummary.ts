// utils/diffSummary.ts
//
// The words of the summary strip above a revision's diff, as text. The statistic
// is `summariseDiff` in ./textDiff; this is only its wording, kept here so the
// on-screen comparison and the printed report say the same thing in the same
// words. Pure: takes the stats, returns strings.

import type { DiffStats } from './textDiff';

/** "84% of your words kept": the share of the original's words the revision keeps. */
export const wordsKeptLine = (stats: Pick<DiffStats, 'retention'>): string =>
  `${Math.round(stats.retention * 100)}% of your words kept`;

/** "63 → 81 words": the count before and after the revision. */
export const wordCountsLine = (stats: Pick<DiffStats, 'originalWords' | 'revisedWords'>): string =>
  `${stats.originalWords} → ${stats.revisedWords} words`;
