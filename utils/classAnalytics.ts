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

const DAY_MS = 86_400_000;

/**
 * Compact "last active" label for the roster ("today", "yesterday", "3d ago",
 * "2w ago", …). Coarse by design — the roster only needs recency at a glance.
 * `now` is injectable for testing. Returns an em dash for missing/bad input.
 */
export const formatLastActive = (
  iso: string | null | undefined,
  now: Date = new Date()
): string => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const days = Math.floor((now.getTime() - then) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

/** The six cognitive tiers, always shown in full so gaps read as "not attempted". */
export const COGNITIVE_TIERS = [1, 2, 3, 4, 5, 6] as const;

export interface TierProfile {
  tier: number;
  attempts: number;
  /** Attempt-weighted average band across the verbs in this tier, or null. */
  avgBand: number | null;
}

/**
 * Fold per-verb aggregates into the six cognitive tiers for the student
 * progress profile. Each tier's band is the attempt-weighted mean of its verbs'
 * average bands, so a verb answered many times counts proportionally. Verbs
 * that aren't known command terms (no tier) or have no scored attempts are
 * skipped. All six tiers are returned — an un-attempted tier reads as 0
 * attempts / null band rather than vanishing.
 */
export const foldVerbsIntoTiers = (
  rows: DimensionAnalytics[],
  tierOf: (label: string) => number | null
): TierProfile[] => {
  const acc = new Map<number, { attempts: number; bandSum: number }>();
  for (const r of rows) {
    const tier = tierOf(r.label);
    if (tier == null || r.attempts <= 0 || r.avg_band == null) continue;
    const cur = acc.get(tier) ?? { attempts: 0, bandSum: 0 };
    cur.attempts += r.attempts;
    cur.bandSum += r.avg_band * r.attempts;
    acc.set(tier, cur);
  }
  return COGNITIVE_TIERS.map((tier) => {
    const a = acc.get(tier);
    return {
      tier,
      attempts: a?.attempts ?? 0,
      avgBand: a && a.attempts > 0 ? a.bandSum / a.attempts : null,
    };
  });
};
