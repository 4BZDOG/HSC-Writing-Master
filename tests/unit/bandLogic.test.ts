import { describe, it, expect } from 'vitest';
import { getBandForMark, markForBand, TIER_GROUPS } from '../../data/commandTerms';

/**
 * Band <-> mark mapping is the single source of truth for the band a student
 * sees (marking, sample answers, the criteria panel, and the improvement
 * target). Tier identity: each tier's maxBand equals its tier number, so the
 * ribbon colour is the ceiling colour everywhere.  For questions worth more
 * than 6 marks the tier cap lifts to 6 so all colours are available.
 */
describe('getBandForMark tier ceilings', () => {
  it('caps at the tier number for ≤6-mark questions', () => {
    expect(getBandForMark(5, 5, 1)).toBe(1); // Tier 1 caps at Band 1 (red)
    expect(getBandForMark(5, 5, 2)).toBe(2); // Tier 2 caps at Band 2 (orange)
    expect(getBandForMark(5, 5, 3)).toBe(3); // Tier 3 caps at Band 3 (yellow)
    expect(getBandForMark(5, 5, 4)).toBe(4); // Tier 4 caps at Band 4 (green)
    expect(getBandForMark(5, 5, 5)).toBe(5); // Tier 5 caps at Band 5 (blue)
    expect(getBandForMark(6, 6, 6)).toBe(6); // Tier 6 reaches Band 6 (purple)
  });

  it('lifts the tier cap to 6 for >6-mark questions', () => {
    expect(getBandForMark(10, 10, 1)).toBe(6); // >6 marks → all 6 bands
    expect(getBandForMark(10, 10, 4)).toBe(6);
    expect(getBandForMark(10, 10, 6)).toBe(6);
  });

  it('returns Band 1 for zero or invalid inputs', () => {
    expect(getBandForMark(0, 10, 4)).toBe(1);
    expect(getBandForMark(5, 0, 4)).toBe(1);
  });
});

describe('markForBand (inverse of getBandForMark)', () => {
  it('round-trips: the chosen mark maps back to (at least) the target band', () => {
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      for (const total of [3, 5, 8, 10]) {
        for (let band = 1; band <= 6; band++) {
          const mark = markForBand(band, total, tier);
          if (getBandForMark(total, total, tier) >= band) {
            expect(getBandForMark(mark, total, tier)).toBeGreaterThanOrEqual(band);
          }
        }
      }
    }
  });

  it('falls back to full marks when the band exceeds the tier ceiling', () => {
    // Tier 1 with 5 marks caps at Band 1, so Band 2 is unreachable.
    expect(markForBand(2, 5, 1)).toBe(5);
  });

  it('matches TIER_GROUPS maxBand declarations for >6-mark questions', () => {
    for (const group of TIER_GROUPS) {
      // >6 marks lifts the tier cap, so all tiers reach Band 6 at 10/10.
      const fullMarkBand = getBandForMark(10, 10, group.tier);
      expect(fullMarkBand).toBe(6);
    }
  });
});
