/**
 * Pure shaping for the Class Insights panel (featureRoadmap.md → Longer-term →
 * "Teacher-facing class analytics"). Takes the raw per-verb aggregates from
 * `get_class_analytics` and ranks them by where a cohort is struggling most,
 * enriched with each verb's cognitive tier. Kept free of React/data imports so
 * the ranking is unit-testable; the component supplies `tierOf`.
 */
import type { VerbAnalytics } from '../services/responseService';

export interface RankedVerbRow extends VerbAnalytics {
  /** Cognitive tier (1–6) for the verb, or null if it isn't a known command term. */
  tier: number | null;
  /** low_band_rate as an integer percentage (0–100). */
  lowBandPct: number;
}

/**
 * Rank verbs weakest-first: highest struggling rate, then most attempts (more
 * evidence), then alphabetically for a stable order. Verbs with no attempts are
 * dropped — an empty aggregate carries no signal.
 */
export const rankVerbWeakness = (
  rows: VerbAnalytics[],
  tierOf: (verb: string) => number | null
): RankedVerbRow[] =>
  rows
    .filter((r) => r.attempts > 0)
    .map((r) => ({
      ...r,
      tier: tierOf(r.verb),
      lowBandPct: Math.round((Number.isFinite(r.low_band_rate) ? r.low_band_rate : 0) * 100),
    }))
    .sort(
      (a, b) =>
        b.low_band_rate - a.low_band_rate || b.attempts - a.attempts || a.verb.localeCompare(b.verb)
    );

/** Compact band label: one decimal, or an em dash when unscored. */
export const formatBand = (band: number | null | undefined): string =>
  band == null || !Number.isFinite(band) ? '—' : band.toFixed(1);
