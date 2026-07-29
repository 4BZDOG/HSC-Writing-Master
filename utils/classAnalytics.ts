/**
 * Pure shaping for the Class Insights panel (featureRoadmap.md → Teacher-facing
 * class analytics). Takes the raw per-dimension aggregates from
 * `get_class_analytics` (verb OR topic — both share the same row shape) and
 * ranks them by where a cohort is struggling most. For the verb dimension each
 * row is enriched with the verb's cognitive tier. Kept free of React/data
 * imports so the ranking is unit-testable; the component supplies `tierOf`.
 *
 * ## Why the ranking is on marks, not bands
 *
 * This used to rank on `low_band_rate` (the share of attempts at band ≤ 3).
 * That is not comparable across questions: the Verb Gate caps a question's band
 * at its verb's cognitive tier, so full marks on an IDENTIFY question is band 1
 * and on an EXPLAIN question band 3. Every tier 1–3 verb scored 100% there
 * regardless of how well it was answered, while tier 6 verbs looked healthy on
 * far weaker work — the ranking reported verb tier and called it weakness.
 *
 * Measuring band against the tier ceiling does not rescue it either: on a
 * tier-1 question every non-zero mark maps to band 1, so the band scale has a
 * single value and half marks read the same as full marks.
 *
 * `avg_mark_frac` — the share of available marks earned — is well defined at
 * every tier, so it is what we rank on. Bands are still reported (they are the
 * NESA-facing scale); they are simply not the ranking key. See schema §13.
 */
import type { DimensionAnalytics } from '../services/responseService';

export interface RankedRow extends DimensionAnalytics {
  /** Cognitive tier (1–6) for a verb, or null (topics, or unknown verbs). */
  tier: number | null;
  /** low_band_rate as an integer percentage (0–100) — reported, not ranked on. */
  lowBandPct: number;
  /**
   * Share of available marks LOST, as an integer percentage (0–100) — the
   * weakness measure the rows are ranked by, so a longer bar always means
   * weaker. Null when the row carries no mark data (an older deployment, or
   * questions with no marks recorded), which the UI must render as "no data"
   * rather than as zero — a row with nothing known about it is not a row where
   * nothing was lost.
   */
  markLostPct: number | null;
}

/** Never enrich with a tier (used for the topic dimension). */
export const NO_TIER = (): number | null => null;

/** Share of available marks lost (0–1), or null when the row has no mark data. */
const markLost = (row: DimensionAnalytics): number | null => {
  const frac = row.avg_mark_frac;
  if (frac == null || !Number.isFinite(frac)) return null;
  // Clamp: a mark above the question total would otherwise produce a negative
  // shortfall and sort as the strongest row on the chart.
  return Math.min(1, Math.max(0, 1 - frac));
};

/**
 * Rank dimension rows weakest-first: most marks lost, then most attempts (more
 * evidence), then alphabetically for a stable order. Rows with no attempts are
 * dropped — an empty aggregate carries no signal. Rows with attempts but no
 * mark data sort last, after every row that can be measured, rather than
 * masquerading as perfect scores. `tierOf` enriches verb rows with a cognitive
 * tier; pass NO_TIER for topics.
 */
export const rankByWeakness = (
  rows: DimensionAnalytics[],
  tierOf: (label: string) => number | null = NO_TIER
): RankedRow[] =>
  rows
    .filter((r) => r.attempts > 0)
    .map((r) => {
      const lost = markLost(r);
      return {
        ...r,
        tier: tierOf(r.label),
        lowBandPct: Math.round((Number.isFinite(r.low_band_rate) ? r.low_band_rate : 0) * 100),
        markLostPct: lost == null ? null : Math.round(lost * 100),
      };
    })
    .sort((a, b) => {
      const al = markLost(a);
      const bl = markLost(b);
      // Unmeasurable rows go last, but keep a deterministic order among them.
      if (al == null && bl != null) return 1;
      if (bl == null && al != null) return -1;
      if (al != null && bl != null && al !== bl) return bl - al;
      return b.attempts - a.attempts || a.label.localeCompare(b.label);
    });

/**
 * Mark-share label as a whole percentage, or an em dash when unknown. An em dash
 * rather than "0%" — a row with no mark data is not a row that scored nothing.
 */
export const formatMarkFrac = (frac: number | null | undefined): string =>
  frac == null || !Number.isFinite(frac) ? '—' : `${Math.round(frac * 100)}%`;

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

export interface SparklineOpts {
  width: number;
  height: number;
  min: number;
  max: number;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * SVG polyline `points` for a sparkline: values are spread evenly across
 * `width` (a single value sits centred) and mapped into `[min, max]` on an
 * inverted y-axis (higher value = higher on screen), clamped to that range.
 * Returns '' for an empty series. Pure geometry — unit-tested.
 */
export const sparklinePoints = (values: number[], opts: SparklineOpts): string => {
  const { width, height, min, max } = opts;
  if (values.length === 0) return '';
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
      const clamped = Math.min(max, Math.max(min, v));
      const y = height - ((clamped - min) / span) * height;
      return `${round1(x)},${round1(y)}`;
    })
    .join(' ');
};

/** The six cognitive tiers, always shown in full so gaps read as "not attempted". */
export const COGNITIVE_TIERS = [1, 2, 3, 4, 5, 6] as const;

export interface TierProfile {
  tier: number;
  attempts: number;
  /** Attempt-weighted average band across the verbs in this tier, or null. */
  avgBand: number | null;
  /**
   * Attempt-weighted mean share of available marks earned at this tier (0–1),
   * or null when no mark data is available.
   *
   * This — not `avgBand` — is what a tier profile should be drawn from. A tier's
   * band is capped at the tier number (the Verb Gate), so plotting band against
   * a fixed 1–6 axis produces a rising staircase for EVERY student, flawless or
   * failing: tier 1 can never exceed band 1, tier 6 can reach band 6. That
   * gradient is an artefact of the scale, not a fact about the learner.
   */
  markFrac: number | null;
}

/**
 * Fold per-verb aggregates into the six cognitive tiers for the student
 * progress profile. Each tier's band and mark share are the attempt-weighted
 * means of its verbs', so a verb answered many times counts proportionally.
 * Verbs that aren't known command terms (no tier) or have no scored attempts
 * are skipped. All six tiers are returned — an un-attempted tier reads as 0
 * attempts / null rather than vanishing.
 */
export const foldVerbsIntoTiers = (
  rows: DimensionAnalytics[],
  tierOf: (label: string) => number | null
): TierProfile[] => {
  const acc = new Map<
    number,
    { attempts: number; bandSum: number; markAttempts: number; markSum: number }
  >();
  for (const r of rows) {
    const tier = tierOf(r.label);
    if (tier == null || r.attempts <= 0 || r.avg_band == null) continue;
    const cur = acc.get(tier) ?? { attempts: 0, bandSum: 0, markAttempts: 0, markSum: 0 };
    cur.attempts += r.attempts;
    cur.bandSum += r.avg_band * r.attempts;
    // Mark data is weighted over only the attempts that carry it, so one verb
    // without marks does not drag the tier's share toward zero.
    if (r.avg_mark_frac != null && Number.isFinite(r.avg_mark_frac)) {
      cur.markAttempts += r.attempts;
      cur.markSum += r.avg_mark_frac * r.attempts;
    }
    acc.set(tier, cur);
  }
  return COGNITIVE_TIERS.map((tier) => {
    const a = acc.get(tier);
    return {
      tier,
      attempts: a?.attempts ?? 0,
      avgBand: a && a.attempts > 0 ? a.bandSum / a.attempts : null,
      markFrac: a && a.markAttempts > 0 ? a.markSum / a.markAttempts : null,
    };
  });
};
