import { describe, it, expect } from 'vitest';
import { BAND_HEX, getBandHex, getBandName } from '../../utils/renderUtils';
import { getTargetBand } from '../../data/commandTerms';
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

describe('sanitiseKeywords', () => {
  it('trims, strips list markers and drops blanks', () => {
    expect(sanitiseKeywords([' - mitosis ', '• helicase', '', '  '])).toEqual([
      'mitosis',
      'helicase',
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
