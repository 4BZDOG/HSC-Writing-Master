import { describe, it, expect } from 'vitest';
import {
  BAND_HEX,
  getBandHex,
  getBandName,
  getBandConfig,
  getTierBandConfig,
} from '../../utils/renderUtils';
import {
  getTargetBand,
  getTierTargetBand,
  getVerbBandCeiling,
  getBandForMark,
  getMarksBandCap,
  TIER_GROUPS,
} from '../../data/commandTerms';
import { sanitiseKeywords } from '../../services/geminiService';

/**
 * The band a student works toward must be ONE predefined colour everywhere. The
 * canonical hex palette is the single source of truth; these lock it down so a
 * future edit can't silently reintroduce the old editor/prompt colour drift.
 */
describe('band colour palette', () => {
  it('defines a distinct hex for every band 1-6', () => {
    const hexes = [1, 2, 3, 4, 5, 6].map((b) => BAND_HEX[b]);
    expect(new Set(hexes).size).toBe(6);
    hexes.forEach((h) => expect(h).toMatch(/^#[0-9a-f]{6}$/i));
  });

  it('clamps out-of-range bands to the 1-6 palette', () => {
    expect(getBandHex(0)).toBe(BAND_HEX[1]);
    expect(getBandHex(9)).toBe(BAND_HEX[6]);
    expect(getBandHex(3.4)).toBe(BAND_HEX[3]);
  });

  it('names the top and bottom bands', () => {
    expect(getBandName(6)).toBe('Outstanding');
    expect(getBandName(1)).toBe('Elementary');
  });
});

describe('getTargetBand', () => {
  it('maps a verb tier to the band a full-mark response reaches', () => {
    // NESA-aligned: Tier 1→Band 3, Tier 2→Band 4, Tier 3→Band 5, Tier 4-6→Band 6
    expect(getTargetBand(2, 1)).toBe(3); // Identify (Tier 1), 2 marks → Band 3
    expect(getTargetBand(4, 2)).toBe(4); // Describe (Tier 2), 4 marks → Band 4
    expect(getTargetBand(6, 3)).toBe(5); // Explain (Tier 3), 6 marks → Band 5
    expect(getTargetBand(8, 4)).toBe(6); // Analyse (Tier 4), 8 marks → Band 6
  });
});

describe('getTierTargetBand', () => {
  it('maps each cognitive tier to its NESA-aligned band ceiling', () => {
    expect(getTierTargetBand(1)).toBe(3);
    expect(getTierTargetBand(2)).toBe(4);
    expect(getTierTargetBand(3)).toBe(5);
    expect(getTierTargetBand(4)).toBe(6);
    expect(getTierTargetBand(5)).toBe(6);
    expect(getTierTargetBand(6)).toBe(6);
  });

  it('agrees with getTargetBand at full marks (10/10) for every tier', () => {
    for (let tier = 1; tier <= 6; tier++) {
      expect(getTierTargetBand(tier)).toBe(getTargetBand(10, tier));
    }
  });
});

describe('band model consistency', () => {
  it('marks a full-mark response exactly at each tier\'s declared ceiling', () => {
    for (const group of TIER_GROUPS) {
      const marked = getBandForMark(10, 10, group.tier);
      expect(marked).toBe(group.maxBand);
      expect(getTierTargetBand(group.tier)).toBe(group.maxBand);
    }
  });

  it('never awards a band above the ceiling at any mark ratio', () => {
    for (const group of TIER_GROUPS) {
      const ceiling = getTierTargetBand(group.tier);
      for (let mark = 0; mark <= 10; mark++) {
        expect(getBandForMark(mark, 10, group.tier)).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('resolves a verb to its cognitive-demand band ceiling', () => {
    expect(getVerbBandCeiling('DESCRIBE')).toBe(4); // Tier 2 → Band 4
    expect(getVerbBandCeiling('ANALYSE')).toBe(6); // Tier 4 → Band 6
    expect(getVerbBandCeiling('EVALUATE')).toBe(6); // Tier 6 → Band 6
    expect(getVerbBandCeiling('IDENTIFY')).toBe(3); // Tier 1 → Band 3
    expect(getVerbBandCeiling('EXPLAIN')).toBe(5); // Tier 3 → Band 5
  });
});

describe('getTierBandConfig', () => {
  it('returns the colour config of the tier\'s target band', () => {
    // Every tier's config matches its target band's config.
    for (let tier = 1; tier <= 6; tier++) {
      expect(getTierBandConfig(tier)).toEqual(getBandConfig(getTierTargetBand(tier)));
    }
  });
});

describe('marks-based band cap (on-the-fly adjustment)', () => {
  it('caps an N-mark question at roughly Band N+1', () => {
    expect(getMarksBandCap(1)).toBe(2);
    expect(getMarksBandCap(2)).toBe(3);
    expect(getMarksBandCap(3)).toBe(4);
    expect(getMarksBandCap(4)).toBe(5);
    expect(getMarksBandCap(5)).toBe(6);
    expect(getMarksBandCap(12)).toBe(6);
  });

  it('normalises off-scheme questions: a lofty verb on a tiny question is capped by marks', () => {
    // A Tier-6 verb on a 3-mark question tops out at Band 4 (marks cap dominates).
    expect(getTargetBand(3, 6)).toBe(4);
    // A Tier-4 verb on a 2-mark question: marksCap=3, tierMax=6 → capped at 3.
    expect(getTargetBand(2, 4)).toBe(3);
  });

  it('applies the cap to every derived band, not just the ceiling', () => {
    for (let mark = 0; mark <= 3; mark++) {
      expect(getBandForMark(mark, 3, 6)).toBeLessThanOrEqual(getMarksBandCap(3));
    }
  });
});

describe('sanitiseKeywords', () => {
  it('trims, strips list markers and drops blanks', () => {
    expect(
      sanitiseKeywords([' - mitosis ', '• helicase', '1. osmosis', '2) diffusion', '', '  '])
    ).toEqual(['mitosis', 'helicase', 'osmosis', 'diffusion']);
  });

  it('keeps leading digits in real terms (only strips list markers)', () => {
    expect(sanitiseKeywords(['3D printing', '1st law of thermodynamics'])).toEqual([
      '3D printing',
      '1st law of thermodynamics',
    ]);
  });

  it('removes case-insensitive duplicates, keeping first occurrence', () => {
    expect(sanitiseKeywords(['Enzyme', 'enzyme', 'ENZYME', 'substrate'])).toEqual([
      'Enzyme',
      'substrate',
    ]);
  });

  it('drops the command verb and generic filler words', () => {
    expect(sanitiseKeywords(['describe', 'process', 'osmosis', 'important'], 'describe')).toEqual([
      'osmosis',
    ]);
  });

  it('rejects over-long phrases and caps the list at 12', () => {
    expect(sanitiseKeywords(['this is a very long non-keyword phrase indeed'])).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => `term${i}`);
    expect(sanitiseKeywords(many)).toHaveLength(12);
  });
});
