import { describe, it, expect } from 'vitest';
import { getBandForMark, markForBand, TIER_GROUPS } from '../../data/commandTerms';

/**
 * Band <-> mark mapping is the single source of truth for the band a student
 * sees (marking, sample answers, the criteria panel, and the improvement
 * target). Tier identity: each tier's maxBand equals its tier number, so the
 * ribbon colour is the ceiling colour everywhere.  The verb's tier is the
 * ceiling, held to Band 5 on six marks or fewer (see getQuestionBandCeiling).
 */
describe('getBandForMark tier ceilings', () => {
  it('caps at the tier number, and at Band 5 on six marks or fewer', () => {
    expect(getBandForMark(5, 5, 1)).toBe(1);
    expect(getBandForMark(5, 5, 2)).toBe(2);
    expect(getBandForMark(5, 5, 3)).toBe(3);
    expect(getBandForMark(5, 5, 4)).toBe(4);
    expect(getBandForMark(5, 5, 5)).toBe(5);
    expect(getBandForMark(6, 6, 6)).toBe(5);
    expect(getBandForMark(7, 7, 6)).toBe(6);
    expect(getBandForMark(10, 10, 2)).toBe(2);
    expect(getBandForMark(10, 10, 4)).toBe(4);
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

  it('full marks reach the tier ceiling, or Band 5 on six marks or fewer', () => {
    for (const group of TIER_GROUPS) {
      for (const total of [3, 5, 8, 10]) {
        const ceiling = total <= 6 ? Math.min(group.maxBand, 5) : group.maxBand;
        expect(getBandForMark(total, total, group.tier)).toBe(ceiling);
      }
    }
  });
});
