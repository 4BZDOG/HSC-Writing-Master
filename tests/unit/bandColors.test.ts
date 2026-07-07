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
    // Tier -> ceiling band (see TIER_GROUPS).
    expect(getTargetBand(4, 2)).toBe(3); // Describe (Tier 2) → Band 3
    expect(getTargetBand(5, 4)).toBe(5); // Analyse (Tier 4) → Band 5
    expect(getTargetBand(8, 5)).toBe(6); // Synthesise (Tier 5) → Band 6
    expect(getTargetBand(2, 1)).toBe(2); // Identify (Tier 1) → Band 2
  });
});

describe('getTierTargetBand', () => {
  it('maps each cognitive tier to the band it targets (mark-independent)', () => {
    // The verb-hierarchy ribbon colours by this, so a verb shows the same band
    // colour there as in the prompt (which uses getTargetBand for the same tier).
    expect(getTierTargetBand(1)).toBe(2);
    expect(getTierTargetBand(2)).toBe(3); // Describe → Band 3 (yellow), not tier-2 orange
    expect(getTierTargetBand(3)).toBe(4);
    expect(getTierTargetBand(4)).toBe(5);
    expect(getTierTargetBand(5)).toBe(6);
    expect(getTierTargetBand(6)).toBe(6);
  });

  it('agrees with getTargetBand at full marks for every tier', () => {
    for (let tier = 1; tier <= 6; tier++) {
      expect(getTierTargetBand(tier)).toBe(getTargetBand(10, tier));
    }
  });
});

describe('band model consistency', () => {
  // The band a full-mark answer is marked (getBandForMark) must never exceed the
  // declared cognitive-demand ceiling (getTierTargetBand / TIER_GROUPS.maxBand).
  // This is the single invariant that keeps marking, live feedback, colour and
  // copy from disagreeing — the whole point of the reconciliation.
  it('marks a full-mark response exactly at each tier’s declared ceiling', () => {
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
    expect(getVerbBandCeiling('DESCRIBE')).toBe(3); // Tier 2
    expect(getVerbBandCeiling('ANALYSE')).toBe(5); // Tier 4
    expect(getVerbBandCeiling('EVALUATE')).toBe(6); // Tier 6
  });
});

describe('getTierBandConfig', () => {
  it('returns the colour config of the tier’s target band, not the tier index', () => {
    // Tier 2 (Describe) must colour as Band 3, not Band 2 — the bug the user hit.
    expect(getTierBandConfig(2)).toEqual(getBandConfig(3));
    expect(getTierBandConfig(2)).not.toEqual(getBandConfig(2));
    // Every tier's config matches its target band's config.
    for (let tier = 1; tier <= 6; tier++) {
      expect(getTierBandConfig(tier)).toEqual(getBandConfig(getTierTargetBand(tier)));
    }
  });
});

describe('sanitiseKeywords', () => {
  it('trims, strips list markers and drops blanks', () => {
    expect(sanitiseKeywords([' - mitosis ', '• helicase', '1. osmosis', '2) diffusion', '', '  '])).toEqual([
      'mitosis',
      'helicase',
      'osmosis',
      'diffusion',
    ]);
  });

  it('keeps leading digits in real terms (only strips list markers)', () => {
    // A greedy `^[-•*\\d.\\s]+` strip would mangle these to "D printing" / "st law".
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
