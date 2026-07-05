/**
 * Pure shaping for the Class Insights panel (featureRoadmap.md → Teacher-facing
 * class analytics). Takes the raw per-dimension aggregates from
 * `get_class_analytics` (verb OR topic — both share the `label`/`low_band_rate`
 * shape) and ranks them by where a cohort is struggling most. For the verb
 * dimension each row is enriched with the verb's cognitive tier. Kept free of
 * React/data imports so the ranking is unit-testable; the component supplies
 * `tierOf`.
 */
import type { DimensionAnalytics } from '../services/responseService';

export interface RankedRow extends DimensionAnalytics {
  /** Cognitive tier (1–6) for a verb, or null (topics, or unknown verbs). */
  tier: number | null;
  /** low_band_rate as an integer percentage (0–100). */
  lowBandPct: number;
}

/** Never enrich with a tier (used for the topic dimension). */
export const NO_TIER = (): number | null => null;

/**
 * Rank dimension rows weakest-first: highest struggling rate, then most
 * attempts (more evidence), then alphabetically for a stable order. Rows with
 * no attempts are dropped — an empty aggregate carries no signal. `tierOf`
 * enriches verb rows with a cognitive tier; pass NO_TIER for topics.
 */
export const rankByWeakness = (
  rows: DimensionAnalytics[],
  tierOf: (label: string) => number | null = NO_TIER
): RankedRow[] =>
  rows
    .filter((r) => r.attempts > 0)
    .map((r) => ({
      ...r,
      tier: tierOf(r.label),
      lowBandPct: Math.round((Number.isFinite(r.low_band_rate) ? r.low_band_rate : 0) * 100),
    }))
    .sort(
      (a, b) =>
        b.low_band_rate - a.low_band_rate ||
        b.attempts - a.attempts ||
        a.label.localeCompare(b.label)
    );

/** Compact band label: one decimal, or an em dash when unscored. */
export const formatBand = (band: number | null | undefined): string =>
  band == null || !Number.isFinite(band) ? '—' : band.toFixed(1);
