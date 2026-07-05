import { describe, it, expect } from 'vitest';
import { rankVerbWeakness, formatBand } from '../../utils/classAnalytics';
import type { VerbAnalytics } from '../../services/responseService';

const verb = (over: Partial<VerbAnalytics>): VerbAnalytics => ({
  verb: 'Describe',
  attempts: 5,
  students: 3,
  avg_mark: 4,
  avg_band: 4,
  low_band_rate: 0.2,
  ...over,
});

// Stub tier lookup: Evaluate=6, Describe=2, everything else unknown.
const tierOf = (v: string): number | null => ({ Evaluate: 6, Describe: 2 })[v] ?? null;

describe('rankVerbWeakness', () => {
  it('orders weakest (highest low-band rate) first', () => {
    const ranked = rankVerbWeakness(
      [
        verb({ verb: 'Describe', low_band_rate: 0.1, attempts: 10 }),
        verb({ verb: 'Evaluate', low_band_rate: 0.8, attempts: 4 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.verb)).toEqual(['Evaluate', 'Describe']);
  });

  it('breaks ties by attempts, then verb name', () => {
    const ranked = rankVerbWeakness(
      [
        verb({ verb: 'Apply', low_band_rate: 0.5, attempts: 3 }),
        verb({ verb: 'Analyse', low_band_rate: 0.5, attempts: 9 }),
        verb({ verb: 'Assess', low_band_rate: 0.5, attempts: 3 }),
      ],
      tierOf
    );
    expect(ranked.map((r) => r.verb)).toEqual(['Analyse', 'Apply', 'Assess']);
  });

  it('enriches rows with tier and an integer percentage', () => {
    const [row] = rankVerbWeakness([verb({ verb: 'Evaluate', low_band_rate: 0.667 })], tierOf);
    expect(row.tier).toBe(6);
    expect(row.lowBandPct).toBe(67);
  });

  it('marks an unknown verb tier as null', () => {
    const [row] = rankVerbWeakness([verb({ verb: 'Unspecified' })], tierOf);
    expect(row.tier).toBeNull();
  });

  it('drops verbs with no attempts', () => {
    const ranked = rankVerbWeakness(
      [verb({ verb: 'Evaluate', attempts: 0 }), verb({ verb: 'Describe', attempts: 2 })],
      tierOf
    );
    expect(ranked.map((r) => r.verb)).toEqual(['Describe']);
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
