import { describe, it, expect } from 'vitest';
import { getBandForMark, markForBand } from '../../data/commandTerms';

/**
 * Band <-> mark mapping is the single source of truth for the band a student
 * sees (marking, sample answers, the criteria panel, and the improvement
 * target). These tests lock in the tier ceilings and the inverse helper used to
 * pick a concrete mark for a target band.
 */
describe('getBandForMark tier ceilings', () => {
  it('caps low-tier verbs below the top band even at full marks', () => {
    expect(getBandForMark(10, 10, 2)).toBe(3); // Tier 2 (Describe) tops out at Band 3
    expect(getBandForMark(3, 3, 1)).toBe(2); // Tier 1 (Identify) tops out at Band 2
    expect(getBandForMark(4, 4, 3)).toBe(4); // Tier 3 (Apply) tops out at Band 4
  });

  it('lets high-tier verbs reach the top band', () => {
    expect(getBandForMark(10, 10, 5)).toBe(6);
    expect(getBandForMark(10, 10, 6)).toBe(6);
  });

  it('returns Band 1 for zero or invalid inputs', () => {
    expect(getBandForMark(0, 10, 4)).toBe(1);
    expect(getBandForMark(5, 0, 4)).toBe(1);
  });
});

describe('markForBand (inverse of getBandForMark)', () => {
  it('returns the smallest mark that reaches the target band', () => {
    // Tier 4, /10: Band 5 needs ratio >= 0.9 -> 9 marks; Band 4 needs >= 0.7 -> 7.
    expect(markForBand(5, 10, 4)).toBe(9);
    expect(markForBand(4, 10, 4)).toBe(7);
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
    // Tier 2 caps at Band 3, so Band 4 is unreachable -> clamp to totalMarks.
    expect(markForBand(4, 6, 2)).toBe(6);
  });
});
