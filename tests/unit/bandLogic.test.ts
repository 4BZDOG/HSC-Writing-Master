import { describe, it, expect } from 'vitest';
import { getBandForMark, markForBand, TIER_GROUPS } from '../../data/commandTerms';

/**
 * Band <-> mark mapping is the single source of truth for the band a student
 * sees (marking, sample answers, the criteria panel, and the improvement
 * target). Tier identity: each tier's maxBand equals its tier number, so the
 * ribbon colour is the ceiling colour everywhere.  The verb's tier is the
 * sole ceiling — there is no secondary marks-based cap.
 */
describe('getBandForMark tier ceilings', () => {
  it('caps at the tier number regardless of mark count', () => {
    expect(getBandForMark(5, 5, 1)).toBe(1);
    expect(getBandForMark(5, 5, 2)).toBe(2);
    expect(getBandForMark(5, 5, 3)).toBe(3);
    expect(getBandForMark(5, 5, 4)).toBe(4);
    expect(getBandForMark(5, 5, 5)).toBe(5);
    expect(getBandForMark(6, 6, 6)).toBe(6);
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

  it('full marks always reach the tier ceiling regardless of mark count', () => {
    for (const group of TIER_GROUPS) {
      for (const total of [3, 5, 8, 10]) {
        expect(getBandForMark(total, total, group.tier)).toBe(group.maxBand);
      }
    }
  });
});
