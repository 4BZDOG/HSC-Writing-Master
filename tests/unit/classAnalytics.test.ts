import { describe, it, expect } from 'vitest';
import {
  rankByWeakness,
  formatBand,
  formatMarkFrac,
  NO_TIER,
  foldVerbsIntoTiers,
  formatLastActive,
  sparklinePoints,
} from '../../utils/classAnalytics';
import type { DimensionAnalytics } from '../../services/responseService';

const dim = (over: Partial<DimensionAnalytics>): DimensionAnalytics => ({
  label: 'Describe',
  attempts: 5,
  students: 3,
  avg_mark: 4,
  avg_band: 4,
  low_band_rate: 0.2,
  avg_mark_frac: 0.8,
  ...over,
});

// Stub tier lookup: Evaluate=6, Describe=2, everything else unknown.
const tierOf = (v: string): number | null => ({ Evaluate: 6, Describe: 2 })[v] ?? null;

describe('rankByWeakness', () => {
  it('orders weakest (fewest marks earned) first', () => {
    const ranked = rankByWeakness(
      [
        dim({ label: 'Describe', avg_mark_frac: 0.9, attempts: 10 }),
        dim({ label: 'Evaluate', avg_mark_frac: 0.3, attempts: 4 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.label)).toEqual(['Evaluate', 'Describe']);
  });

  it('ignores low_band_rate when ranking', () => {
    // The regression this whole change exists for: the Verb Gate caps a
    // question's band at its verb's tier, so a tier-1 verb reads 100% band ≤ 3
    // on flawless work. Ranking on that put the cohort's best verb top of the
    // "struggling" list and its worst verb last.
    const ranked = rankByWeakness(
      [
        // Perfect marks, but band-capped at 1 → 100% "struggling".
        dim({ label: 'Identify', low_band_rate: 1, avg_mark_frac: 1, attempts: 100 }),
        // Half the marks lost, but a high ceiling → looks healthy on bands.
        dim({ label: 'Evaluate', low_band_rate: 0.2, avg_mark_frac: 0.5, attempts: 20 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.label)).toEqual(['Evaluate', 'Identify']);
    expect(ranked[0].markLostPct).toBe(50);
    expect(ranked[1].markLostPct).toBe(0);
  });

  it('breaks ties by attempts, then label', () => {
    const ranked = rankByWeakness(
      [
        dim({ label: 'Apply', avg_mark_frac: 0.5, attempts: 3 }),
        dim({ label: 'Analyse', avg_mark_frac: 0.5, attempts: 9 }),
        dim({ label: 'Assess', avg_mark_frac: 0.5, attempts: 3 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.label)).toEqual(['Analyse', 'Apply', 'Assess']);
  });

  it('enriches rows with tier and integer percentages', () => {
    const [row] = rankByWeakness(
      [dim({ label: 'Evaluate', low_band_rate: 0.667, avg_mark_frac: 0.333 })],
      tierOf
    );
    expect(row.tier).toBe(6);
    expect(row.lowBandPct).toBe(67);
    expect(row.markLostPct).toBe(67);
  });

  it('reports no mark data as null, not as zero marks lost', () => {
    // A deployment predating schema §13 returns no avg_mark_frac. Treating that
    // as 0% lost would paint every row green and rank them as flawless.
    const [row] = rankByWeakness([dim({ label: 'Describe', avg_mark_frac: null })], tierOf);
    expect(row.markLostPct).toBeNull();
  });

  it('sorts rows with no mark data last, behind every measurable row', () => {
    const ranked = rankByWeakness(
      [
        dim({ label: 'NoData', avg_mark_frac: null, attempts: 500 }),
        dim({ label: 'Strong', avg_mark_frac: 0.99, attempts: 2 }),
        dim({ label: 'Weak', avg_mark_frac: 0.1, attempts: 2 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.label)).toEqual(['Weak', 'Strong', 'NoData']);
  });

  it('keeps a deterministic order among rows with no mark data', () => {
    const ranked = rankByWeakness(
      [
        dim({ label: 'Bravo', avg_mark_frac: null, attempts: 2 }),
        dim({ label: 'Alpha', avg_mark_frac: null, attempts: 2 }),
        dim({ label: 'Charlie', avg_mark_frac: null, attempts: 9 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.label)).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('clamps a mark above the question total to zero lost', () => {
    // Otherwise a bad row sorts as the strongest thing on the chart.
    const [row] = rankByWeakness([dim({ label: 'Odd', avg_mark_frac: 1.4 })], tierOf);
    expect(row.markLostPct).toBe(0);
  });

  it('treats a non-finite mark fraction as no data', () => {
    const [row] = rankByWeakness([dim({ label: 'Odd', avg_mark_frac: NaN })], tierOf);
    expect(row.markLostPct).toBeNull();
  });

  it('marks an unknown verb tier as null', () => {
    const [row] = rankByWeakness([dim({ label: 'Unspecified' })], tierOf);
    expect(row.tier).toBeNull();
  });

  it('defaults to no tier (topic dimension) when tierOf is omitted', () => {
    const [row] = rankByWeakness([dim({ label: 'Data Structures' })]);
    expect(row.tier).toBeNull();
  });

  it('NO_TIER always yields null', () => {
    expect(NO_TIER()).toBeNull();
  });

  it('drops rows with no attempts', () => {
    const ranked = rankByWeakness(
      [dim({ label: 'Evaluate', attempts: 0 }), dim({ label: 'Describe', attempts: 2 })],
      tierOf
    );
    expect(ranked.map((r) => r.label)).toEqual(['Describe']);
  });
});

describe('foldVerbsIntoTiers mark shares', () => {
  it('weights each tier by attempts', () => {
    const tiers = foldVerbsIntoTiers(
      [
        dim({ label: 'Describe', attempts: 9, avg_band: 2, avg_mark_frac: 1 }),
        dim({ label: 'Evaluate', attempts: 1, avg_band: 6, avg_mark_frac: 0 }),
      ],
      tierOf
    );
    expect(tiers.find((t) => t.tier === 2)!.markFrac).toBe(1);
    expect(tiers.find((t) => t.tier === 6)!.markFrac).toBe(0);
  });

  it('averages several verbs in one tier by attempts, not evenly', () => {
    const twoInTier = (v: string): number | null => ({ A: 3, B: 3 })[v] ?? null;
    const tiers = foldVerbsIntoTiers(
      [
        dim({ label: 'A', attempts: 90, avg_band: 3, avg_mark_frac: 1 }),
        dim({ label: 'B', attempts: 10, avg_band: 3, avg_mark_frac: 0 }),
      ],
      twoInTier
    );
    expect(tiers.find((t) => t.tier === 3)!.markFrac).toBeCloseTo(0.9, 5);
  });

  it('does not let a verb without marks drag the tier toward zero', () => {
    const twoInTier = (v: string): number | null => ({ A: 4, B: 4 })[v] ?? null;
    const tiers = foldVerbsIntoTiers(
      [
        dim({ label: 'A', attempts: 10, avg_band: 4, avg_mark_frac: 0.8 }),
        dim({ label: 'B', attempts: 10, avg_band: 4, avg_mark_frac: null }),
      ],
      twoInTier
    );
    const t4 = tiers.find((t) => t.tier === 4)!;
    // Both verbs count toward attempts; only the measurable one sets the share.
    expect(t4.attempts).toBe(20);
    expect(t4.markFrac).toBeCloseTo(0.8, 5);
  });

  it('reports a tier with no mark data as null rather than zero', () => {
    const tiers = foldVerbsIntoTiers(
      [dim({ label: 'Evaluate', attempts: 4, avg_band: 5, avg_mark_frac: null })],
      tierOf
    );
    expect(tiers.find((t) => t.tier === 6)!.markFrac).toBeNull();
    expect(tiers.find((t) => t.tier === 6)!.attempts).toBe(4);
  });

  it('leaves un-attempted tiers null', () => {
    const tiers = foldVerbsIntoTiers([dim({ label: 'Evaluate', attempts: 3 })], tierOf);
    expect(tiers.find((t) => t.tier === 1)!.markFrac).toBeNull();
    expect(tiers.find((t) => t.tier === 1)!.attempts).toBe(0);
  });

  it('does not reproduce a rising staircase for a flawless student', () => {
    // The regression: with band ÷ 6 bars, full marks at every tier still drew
    // 17%, 33%, 50%, 67%, 83%, 100% — a gradient owned by the scale, not the
    // student. On marks, full marks is 100% at every tier.
    const allTiers = (v: string): number | null => Number(v.replace('T', ''));
    const tiers = foldVerbsIntoTiers(
      [1, 2, 3, 4, 5, 6].map((t) =>
        dim({ label: `T${t}`, attempts: 5, avg_band: t, avg_mark_frac: 1 })
      ),
      allTiers
    );
    expect(tiers.map((t) => t.markFrac)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe('formatMarkFrac', () => {
  it('renders a whole percentage', () => {
    expect(formatMarkFrac(0.534)).toBe('53%');
    expect(formatMarkFrac(1)).toBe('100%');
    expect(formatMarkFrac(0)).toBe('0%');
  });

  it('renders an em dash rather than 0% when unknown', () => {
    expect(formatMarkFrac(null)).toBe('—');
    expect(formatMarkFrac(undefined)).toBe('—');
    expect(formatMarkFrac(NaN)).toBe('—');
  });
});

describe('foldVerbsIntoTiers', () => {
  it('always returns all six tiers in order', () => {
    const tiers = foldVerbsIntoTiers([], tierOf);
    expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(
      tiers.every((t) => t.attempts === 0 && t.avgBand === null && t.markFrac === null)
    ).toBe(true);
  });

  it('places a verb in its cognitive tier', () => {
    const tiers = foldVerbsIntoTiers(
      [dim({ label: 'Evaluate', attempts: 3, avg_band: 4 })],
      tierOf
    );
    const t6 = tiers.find((t) => t.tier === 6)!;
    expect(t6.tier).toBe(6);
    expect(t6.attempts).toBe(3);
    expect(t6.avgBand).toBe(4);
    expect(t6.markFrac).toBeCloseTo(0.8, 5);
    expect(tiers.find((t) => t.tier === 2)!.attempts).toBe(0);
  });

  it('attempt-weights the band when multiple verbs share a tier', () => {
    // Both map to tier 2 via the stub? Only Describe=2. Use two rows both Describe-tier.
    const local = (v: string): number | null => ({ A: 3, B: 3 })[v] ?? null;
    const tiers = foldVerbsIntoTiers(
      [
        dim({ label: 'A', attempts: 1, avg_band: 6 }),
        dim({ label: 'B', attempts: 3, avg_band: 2 }),
      ],
      local
    );
    // (1*6 + 3*2) / 4 = 3
    const t3 = tiers.find((t) => t.tier === 3)!;
    expect(t3.tier).toBe(3);
    expect(t3.attempts).toBe(4);
    expect(t3.avgBand).toBe(3);
  });

  it('skips unknown-tier verbs and unscored rows', () => {
    const tiers = foldVerbsIntoTiers(
      [
        dim({ label: 'Unspecified', attempts: 5, avg_band: 1 }), // no tier
        dim({ label: 'Evaluate', attempts: 2, avg_band: null }), // unscored
      ],
      tierOf
    );
    expect(tiers.every((t) => t.attempts === 0)).toBe(true);
  });
});

describe('formatBand', () => {
  it('formats a number to one decimal', () => {
    expect(formatBand(4)).toBe('4.0');
    expect(formatBand(3.33)).toBe('3.3');
  });

  it('shows an em dash for null/NaN', () => {
    expect(formatBand(null)).toBe('—');
    expect(formatBand(undefined)).toBe('—');
    expect(formatBand(NaN)).toBe('—');
  });
});

describe('sparklinePoints', () => {
  const opts = { width: 100, height: 30, min: 1, max: 6 };

  it('is empty for no values', () => {
    expect(sparklinePoints([], opts)).toBe('');
  });

  it('centres a single value on x and maps it on the inverted y-axis', () => {
    // band 6 = top (y=0); x centred
    expect(sparklinePoints([6], opts)).toBe('50,0');
    // band 1 = bottom (y=height)
    expect(sparklinePoints([1], opts)).toBe('50,30');
  });

  it('spreads values from x=0 to x=width, newest last', () => {
    const pts = sparklinePoints([1, 6], opts).split(' ');
    expect(pts[0]).toBe('0,30'); // first, band 1 → bottom-left
    expect(pts[1]).toBe('100,0'); // last, band 6 → top-right
  });

  it('clamps out-of-range values into [min, max]', () => {
    expect(sparklinePoints([0], opts)).toBe('50,30'); // below min → floor
    expect(sparklinePoints([9], opts)).toBe('50,0'); // above max → ceil
  });
});

describe('formatLastActive', () => {
  const now = new Date('2026-07-05T12:00:00Z');
  const ago = (days: number) =>
    new Date(now.getTime() - days * 86_400_000 - 3_600_000).toISOString(); // +1h margin

  it('handles today and yesterday', () => {
    expect(formatLastActive(now.toISOString(), now)).toBe('today');
    expect(formatLastActive(ago(1), now)).toBe('yesterday');
  });

  it('scales the unit with age', () => {
    expect(formatLastActive(ago(3), now)).toBe('3d ago');
    expect(formatLastActive(ago(10), now)).toBe('1w ago');
    expect(formatLastActive(ago(45), now)).toBe('1mo ago');
    expect(formatLastActive(ago(400), now)).toBe('1y ago');
  });

  it('returns an em dash for missing or bad input', () => {
    expect(formatLastActive(null, now)).toBe('—');
    expect(formatLastActive(undefined, now)).toBe('—');
    expect(formatLastActive('not-a-date', now)).toBe('—');
  });
});
