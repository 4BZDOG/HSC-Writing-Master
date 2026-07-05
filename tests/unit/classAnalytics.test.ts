import { describe, it, expect } from 'vitest';
import { rankByWeakness, formatBand, NO_TIER } from '../../utils/classAnalytics';
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
