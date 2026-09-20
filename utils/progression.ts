import type { UserStats } from '../types';

/**
 * How a student's profile progresses: XP, level, and the running totals behind
 * the stats and achievements.
 *
 * WHY THIS FILE EXISTS. The rule was written down once, in the DEMO SEED
 * (`utils/demoCohort.ts`), and nowhere else. So the numbers on the profile had
 * two different sources that disagreed:
 *
 *   - the seed derived a level at 100 XP per level, while the profile modal
 *     drew its progress bar against `level * 1000` — a demo student on 465 XP
 *     was shown as Level 5 and "9% to next level" when the curve that produced
 *     the 5 puts them 65% of the way to 6;
 *   - and for a REAL account none of it moved at all. `questionsAnswered`,
 *     `totalWordsWritten`, `averageBand`, `xp` and `level` were initialised to
 *     zero in `DEFAULT_STATS` and never written again by the running app, so
 *     the profile showed a permanent zero-state: nothing completed, Band 0.0,
 *     no words, Level 1, and all eight achievements locked forever. Only the
 *     demo cohort ever had numbers, which is exactly why nobody noticed.
 *
 * One curve, one accumulator, used by the seed, the app and the modal.
 *
 * KEEP THIS FILE IMPORT-LIGHT — it is read by the profile modal, the evaluation
 * hook and the demo seed, so it must not drag the auth stack behind it.
 */

/** XP required to advance one level. */
export const XP_PER_LEVEL = 100;

/**
 * What one marked answer is worth: a flat award for doing the work, plus a
 * bonus for each band above 3.
 *
 * Deliberately rewards turning up more than it rewards being good — a Band 2
 * student who writes every day should out-level a Band 6 student who writes
 * once a term, because the thing the product wants is the practice.
 */
export const xpForEvaluation = (band: number): number => Math.round(10 + Math.max(0, band - 3) * 5);

/** The level a given lifetime XP total sits at. Levels start at 1. */
export const levelForXp = (xp: number): number =>
  Math.max(1, Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1);

export interface LevelProgress {
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level takes to clear. */
  needed: number;
  /** 0–100, for a meter. */
  percent: number;
  /** The level being worked towards. */
  nextLevel: number;
}

/**
 * Progress through the CURRENT level, not through all of history.
 *
 * The modal used to divide lifetime XP by `level * 1000`, which answers a
 * question nobody asked and gets less encouraging the better you do.
 */
export const levelProgress = (xp: number): LevelProgress => {
  const safe = Math.max(0, xp);
  const into = safe % XP_PER_LEVEL;
  return {
    into,
    needed: XP_PER_LEVEL,
    percent: Math.min(100, Math.round((into / XP_PER_LEVEL) * 100)),
    nextLevel: levelForXp(safe) + 1,
  };
};

/**
 * Fold one marked answer into a student's running stats.
 *
 * `averageBand` is a true running mean over every answer ever marked, computed
 * from the previous mean and count rather than kept as a sum — so it stays
 * correct without the profile having to hold every past result.
 *
 * Pure, and returns a new object: the caller decides when to persist.
 */
export const applyEvaluation = (
  stats: UserStats,
  result: { band: number; wordCount: number }
): UserStats => {
  const band = Number.isFinite(result.band) ? Math.max(0, result.band) : 0;
  const words = Number.isFinite(result.wordCount) ? Math.max(0, Math.trunc(result.wordCount)) : 0;
  const answered = Math.max(0, stats.questionsAnswered) + 1;
  const previousMean = Number.isFinite(stats.averageBand) ? Math.max(0, stats.averageBand) : 0;
  const xp = Math.max(0, stats.xp) + xpForEvaluation(band);

  return {
    ...stats,
    questionsAnswered: answered,
    totalWordsWritten: Math.max(0, stats.totalWordsWritten) + words,
    // Rounded to two places for storage; the UI shows one.
    averageBand: Number(((previousMean * (answered - 1) + band) / answered).toFixed(2)),
    xp,
    level: levelForXp(xp),
  };
};
