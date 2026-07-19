import { describe, it, expect } from 'vitest';
import { getBandForMark, markForBand, TIER_GROUPS } from '../../data/commandTerms';

/**
 * Band <-> mark mapping is the single source of truth for the band a student
 * sees (marking, sample answers, the criteria panel, and the improvement
 * target). These tests lock in the tier ceilings and the inverse helper used to
 * pick a concrete mark for a target band.
 *
 * NESA-aligned band ceilings: Tier 1→3, Tier 2→4, Tier 3→5, Tiers 4-6→6.
 */
describe('getBandForMark tier ceilings', () => {
  it('caps each tier at its NESA-aligned maxBand even at full marks', () => {
    expect(getBandForMark(10, 10, 1)).toBe(3); // Tier 1 (Remember & List) tops at Band 3
    expect(getBandForMark(10, 10, 2)).toBe(4); // Tier 2 (Define & Describe) tops at Band 4
    expect(getBandForMark(10, 10, 3)).toBe(5); // Tier 3 (Explain & Compare) tops at Band 5
    expect(getBandForMark(10, 10, 4)).toBe(6); // Tier 4 (Analyse & Apply) reaches Band 6
    expect(getBandForMark(10, 10, 5)).toBe(6); // Tier 5 (Discuss, Assess & Justify) reaches Band 6
  });

  it('lets Tier 6 verbs reach the top band', () => {
    expect(getBandForMark(10, 10, 6)).toBe(6);
  });

  it('returns Band 1 for zero or invalid inputs', () => {
    expect(getBandForMark(0, 10, 4)).toBe(1);
    expect(getBandForMark(5, 0, 4)).toBe(1);
  });
});

describe('markForBand (inverse of getBandForMark)', () => {
  it('returns the smallest mark that reaches the target band', () => {
    // Tier 4, /10: maxBand=6, linear distribution over 6 bands.
    expect(markForBand(4, 10, 4)).toBe(6);
    expect(markForBand(3, 10, 4)).toBe(4);
  });

  it('round-trips: the chosen mark maps back to (at least) the target band', () => {
    for (const tier of [1, 2, 3, 4, 5, 6]) {
      for (const total of [3, 5, 8, 10]) {
        for (let band = 1; band <= 6; band++) {
          const mark = markForBand(band, total, tier);
          // Only assert the round-trip for bands the tier can actually reach.
          if (getBandForMark(total, total, tier) >= band) {
            expect(getBandForMark(mark, total, tier)).toBeGreaterThanOrEqual(band);
          }
        }
      }
    }
  });

  it('falls back to full marks when the band exceeds the tier ceiling', () => {
    // Tier 1 caps at Band 3, so Band 4 is unreachable -> clamp to totalMarks.
    expect(markForBand(4, 6, 1)).toBe(6);
  });

  it('matches TIER_GROUPS maxBand declarations', () => {
    for (const group of TIER_GROUPS) {
      const fullMarkBand = getBandForMark(10, 10, group.tier);
      expect(fullMarkBand).toBe(group.maxBand);
    }
  });
});
