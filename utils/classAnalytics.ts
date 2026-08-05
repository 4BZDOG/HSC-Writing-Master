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
 * NESA-facing scale); they are simply not the ranking key. See schema §18.
 */
import type { ClassCohort, CohortVerbRow, DimensionAnalytics } from '../services/responseService';

/**
 * The fields the tier fold actually reads. Declared narrowly so the per-student
 * cohort rows (`CohortVerbRow`, which carry no `students`/`low_band_rate`) can
 * reuse the same fold as the cohort-wide aggregates instead of being padded with
 * meaningless zeroes.
 */
export type VerbAggregate = Pick<
  DimensionAnalytics,
  'label' | 'attempts' | 'avg_band' | 'avg_mark_frac'
>;

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
  rows: VerbAggregate[],
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

// ---------------------------------------------------------------------------
// Per-student cohort breakdown (schema §20)
// ---------------------------------------------------------------------------

/** Attempts whose verb has no known cognitive tier — see StudentTierRow. */
export interface UntieredAggregate {
  attempts: number;
  markFrac: number | null;
  avgBand: number | null;
}

/** One student's row of the cohort heatmap. */
export interface StudentTierRow {
  username: string;
  /** Every attempt, including untiered ones — so it reconciles with the row. */
  attempts: number;
  /** Mean share of available marks across every verb, or null when unknown. */
  markFrac: number | null;
  /** Attempt-weighted mean band, for reference beside the mark share. */
  avgBand: number | null;
  /** Six tier profiles, always all six so a gap reads as "not attempted". */
  tiers: TierProfile[];
  /**
   * Attempts on questions whose verb is not a known command term — most often
   * "Unspecified", i.e. a question with no verb set.
   *
   * These are surfaced rather than dropped. `foldVerbsIntoTiers` skips unknown
   * verbs (correctly — they belong to no tier), so without this the six tier
   * cells would silently account for fewer attempts than the row's own total,
   * and a bank with unclassified questions would look thinner than it is. On the
   * bundled Enterprise Computing content that is 14 of 82 questions, so it is
   * the common case, not an edge one.
   */
  untiered: UntieredAggregate;
}

/**
 * Folds the flat (student, verb) rows into one row per student, each carrying the
 * six-tier profile.
 *
 * Reuses `foldVerbsIntoTiers` per student, so a student's tier profile here and
 * the one in Student Progress are computed by the same code — they cannot
 * disagree. Students are ordered weakest-first on mark share (the same ordering
 * rule as the verb/topic tables), with unmeasurable students last.
 */
export const buildCohortRows = (
  byStudent: CohortVerbRow[],
  tierOf: (label: string) => number | null
): StudentTierRow[] => {
  const grouped = new Map<string, CohortVerbRow[]>();
  for (const row of byStudent) {
    if (row.attempts <= 0) continue;
    grouped.set(row.username, [...(grouped.get(row.username) ?? []), row]);
  }

  const rows: StudentTierRow[] = [...grouped.entries()].map(([username, verbs]) => {
    const attempts = verbs.reduce((sum, v) => sum + v.attempts, 0);

    // Weight the overall share over only the attempts that carry mark data, so
    // one unmarked question does not drag a student toward zero.
    let markAttempts = 0;
    let markSum = 0;
    let bandAttempts = 0;
    let bandSum = 0;
    for (const v of verbs) {
      if (v.avg_mark_frac != null && Number.isFinite(v.avg_mark_frac)) {
        markAttempts += v.attempts;
        markSum += v.avg_mark_frac * v.attempts;
      }
      if (v.avg_band != null && Number.isFinite(v.avg_band)) {
        bandAttempts += v.attempts;
        bandSum += v.avg_band * v.attempts;
      }
    }

    // Untiered verbs, aggregated the same way so the row reconciles with its cells.
    const untieredVerbs = verbs.filter((v) => tierOf(v.verb) == null);
    let uMarkAttempts = 0;
    let uMarkSum = 0;
    let uBandAttempts = 0;
    let uBandSum = 0;
    for (const v of untieredVerbs) {
      if (v.avg_mark_frac != null && Number.isFinite(v.avg_mark_frac)) {
        uMarkAttempts += v.attempts;
        uMarkSum += v.avg_mark_frac * v.attempts;
      }
      if (v.avg_band != null && Number.isFinite(v.avg_band)) {
        uBandAttempts += v.attempts;
        uBandSum += v.avg_band * v.attempts;
      }
    }

    return {
      username,
      attempts,
      markFrac: markAttempts > 0 ? markSum / markAttempts : null,
      avgBand: bandAttempts > 0 ? bandSum / bandAttempts : null,
      untiered: {
        attempts: untieredVerbs.reduce((sum, v) => sum + v.attempts, 0),
        markFrac: uMarkAttempts > 0 ? uMarkSum / uMarkAttempts : null,
        avgBand: uBandAttempts > 0 ? uBandSum / uBandAttempts : null,
      },
      tiers: foldVerbsIntoTiers(
        verbs.map((v) => ({
          label: v.verb,
          attempts: v.attempts,
          avg_band: v.avg_band,
          avg_mark_frac: v.avg_mark_frac,
        })),
        tierOf
      ),
    };
  });

  return rows.sort((a, b) => {
    if (a.markFrac == null && b.markFrac != null) return 1;
    if (b.markFrac == null && a.markFrac != null) return -1;
    if (a.markFrac != null && b.markFrac != null && a.markFrac !== b.markFrac) {
      return a.markFrac - b.markFrac;
    }
    return b.attempts - a.attempts || a.username.localeCompare(b.username);
  });
};

/** One student's trajectory: a mark share per week bucket, oldest first. */
export interface StudentTrajectory {
  username: string;
  /** One entry per week bucket; null where the student attempted nothing. */
  points: (number | null)[];
  attempts: number;
}

/**
 * Pivots the flat (student, week) rows into a fixed-length series per student.
 *
 * Fixed length matters: every trajectory is drawn on the same x-axis, so a
 * student who was absent in week 3 must leave a gap there rather than shifting
 * their whole line left and appearing to have a different history.
 */
export const buildTrajectories = (
  weekly: ClassCohort['weekly'],
  weeks: number
): StudentTrajectory[] => {
  const span = Math.max(0, Math.trunc(weeks) || 0);
  const byStudent = new Map<string, StudentTrajectory>();

  for (const row of weekly) {
    if (!byStudent.has(row.username)) {
      byStudent.set(row.username, {
        username: row.username,
        points: new Array(span).fill(null),
        attempts: 0,
      });
    }
    const entry = byStudent.get(row.username)!;
    entry.attempts += row.attempts;
    // A week index outside the window is ignored rather than resized into the
    // series — it would silently stretch everyone else's axis.
    if (row.week >= 0 && row.week < span) {
      entry.points[row.week] =
        row.avg_mark_frac != null && Number.isFinite(row.avg_mark_frac) ? row.avg_mark_frac : null;
    }
  }

  return [...byStudent.values()].sort((a, b) => a.username.localeCompare(b.username));
};

/**
 * The change in mark share from a trajectory's first recorded week to its last,
 * or null when fewer than two weeks carry data (a single point is not a trend).
 */
export const trajectoryDelta = (points: (number | null)[]): number | null => {
  const recorded = points.filter((p): p is number => p != null);
  if (recorded.length < 2) return null;
  return recorded[recorded.length - 1] - recorded[0];
};

/** One day of cohort activity, gap-filled across the window. */
export interface DailyPoint {
  day: string;
  attempts: number;
}

/**
 * Gap-fills the daily counts across the whole window so quiet days are drawn as
 * zero rather than skipped — a line that omits them slopes through the gap and
 * hides exactly the pattern (a class that stopped working) the chart is for.
 * `today` is injectable for testing.
 *
 * ## Why the series is `days + 1` long
 *
 * `get_class_cohort(N)` filters on `created_at >= now() - N days`, an instant
 * partway through the day N days ago. So the rows it returns span **N + 1**
 * distinct UTC dates: `today - N` through `today` inclusive. (Confirmed against
 * Postgres: a 30-day window covers 31 dates.)
 *
 * Rendering only N buckets ending today therefore discarded the oldest date
 * entirely. Two things went wrong with that: the chart's own caption
 * ("{total} attempts · peak {max}/day") is summed from this series, so it
 * under-reported and disagreed with any other count of the same window; and the
 * axis label "N days ago" sat under a bucket that was N-1 days old.
 *
 * The oldest bucket is a PARTIAL day — it begins at the window's start instant,
 * not at midnight — so it can read low. That is honest about a rolling window;
 * silently dropping it was not.
 */
export const buildDailySeries = (
  daily: ClassCohort['daily'],
  days: number,
  today: Date = new Date()
): DailyPoint[] => {
  const window = Math.min(365, Math.max(1, Math.trunc(days) || 1));
  const span = window + 1; // `today - window` … `today`, inclusive of both ends
  const counts = new Map(daily.map((d) => [d.day, d.attempts]));
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  const out: DailyPoint[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const day = new Date(end - i * DAY_MS).toISOString().slice(0, 10);
    out.push({ day, attempts: counts.get(day) ?? 0 });
  }
  return out;
};
