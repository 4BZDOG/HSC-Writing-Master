import { describe, it, expect } from 'vitest';
import {
  rankByWeakness,
  formatBand,
  NO_TIER,
  foldVerbsIntoTiers,
  formatLastActive,
} from '../../utils/classAnalytics';
import type { DimensionAnalytics } from '../../services/responseService';

const dim = (over: Partial<DimensionAnalytics>): DimensionAnalytics => ({
  label: 'Describe',
  attempts: 5,
  students: 3,
  avg_mark: 4,
  avg_band: 4,
  low_band_rate: 0.2,
  ...over,
});

// Stub tier lookup: Evaluate=6, Describe=2, everything else unknown.
const tierOf = (v: string): number | null => ({ Evaluate: 6, Describe: 2 })[v] ?? null;

describe('rankByWeakness', () => {
  it('orders weakest (highest low-band rate) first', () => {
    const ranked = rankByWeakness(
      [
        dim({ label: 'Describe', low_band_rate: 0.1, attempts: 10 }),
        dim({ label: 'Evaluate', low_band_rate: 0.8, attempts: 4 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.label)).toEqual(['Evaluate', 'Describe']);
  });

  it('breaks ties by attempts, then label', () => {
    const ranked = rankByWeakness(
      [
        dim({ label: 'Apply', low_band_rate: 0.5, attempts: 3 }),
        dim({ label: 'Analyse', low_band_rate: 0.5, attempts: 9 }),
        dim({ label: 'Assess', low_band_rate: 0.5, attempts: 3 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.label)).toEqual(['Analyse', 'Apply', 'Assess']);
  });

  it('enriches rows with tier and an integer percentage', () => {
    const [row] = rankByWeakness([dim({ label: 'Evaluate', low_band_rate: 0.667 })], tierOf);
    expect(row.tier).toBe(6);
    expect(row.lowBandPct).toBe(67);
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

describe('foldVerbsIntoTiers', () => {
  it('always returns all six tiers in order', () => {
    const tiers = foldVerbsIntoTiers([], tierOf);
    expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(tiers.every((t) => t.attempts === 0 && t.avgBand === null)).toBe(true);
  });

  it('places a verb in its cognitive tier', () => {
    const tiers = foldVerbsIntoTiers(
      [dim({ label: 'Evaluate', attempts: 3, avg_band: 4 })],
      tierOf
    );
    expect(tiers.find((t) => t.tier === 6)).toEqual({ tier: 6, attempts: 3, avgBand: 4 });
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
    expect(tiers.find((t) => t.tier === 3)).toEqual({ tier: 3, attempts: 4, avgBand: 3 });
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
