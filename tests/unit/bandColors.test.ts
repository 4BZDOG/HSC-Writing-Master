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
  it('caps at the tier number regardless of mark count', () => {
    expect(getTargetBand(2, 1)).toBe(1); // Tier 1, 2 marks → Band 1
    expect(getTargetBand(4, 2)).toBe(2); // Tier 2, 4 marks → Band 2
    expect(getTargetBand(6, 3)).toBe(3); // Tier 3, 6 marks → Band 3
    expect(getTargetBand(6, 4)).toBe(4); // Tier 4, 6 marks → Band 4
    expect(getTargetBand(8, 4)).toBe(4); // Tier 4, 8 marks → still Band 4
    expect(getTargetBand(8, 6)).toBe(6); // Tier 6, 8 marks → Band 6
    expect(getTargetBand(7, 5)).toBe(5); // Tier 5, 7 marks → Band 5
  });
});

describe('getTierTargetBand', () => {
  it('maps each cognitive tier to its own number (tier = ceiling colour)', () => {
    expect(getTierTargetBand(1)).toBe(1);
    expect(getTierTargetBand(2)).toBe(2);
    expect(getTierTargetBand(3)).toBe(3);
    expect(getTierTargetBand(4)).toBe(4);
    expect(getTierTargetBand(5)).toBe(5);
    expect(getTierTargetBand(6)).toBe(6);
  });
});

describe('band model consistency', () => {
  it('each tier\'s maxBand equals its tier number', () => {
    for (const group of TIER_GROUPS) {
      expect(group.maxBand).toBe(group.tier);
      expect(getTierTargetBand(group.tier)).toBe(group.tier);
    }
  });

  it('never awards a band above the tier ceiling at any mark count', () => {
    for (const group of TIER_GROUPS) {
      for (const totalMarks of [3, 5, 8, 10]) {
        for (let mark = 0; mark <= totalMarks; mark++) {
          expect(getBandForMark(mark, totalMarks, group.tier)).toBeLessThanOrEqual(group.tier);
        }
      }
    }
  });

  it('resolves a verb to its tier-identity band ceiling', () => {
    expect(getVerbBandCeiling('DESCRIBE')).toBe(2); // Tier 2
    expect(getVerbBandCeiling('ANALYSE')).toBe(4);  // Tier 4
    expect(getVerbBandCeiling('EVALUATE')).toBe(6); // Tier 6
    expect(getVerbBandCeiling('IDENTIFY')).toBe(1); // Tier 1
    expect(getVerbBandCeiling('EXPLAIN')).toBe(3);  // Tier 3
  });
});

/**
 * Both themes have to actually SHOW the band, and only one of them ever gets
 * looked at while a change is being made.
 *
 * The dark tints are alpha washes (`bg-purple-500/10`) over a near-black
 * surface, which read clearly. The light theme mirrored them with the matching
 * `-50` shade — but `purple-50` is #faf5ff and every panel in the app is white,
 * so the wash was a ~2% difference and simply was not there: marking-guide
 * levels, band descriptors and exemplar rows all showed a coloured border and
 * no fill, and the band ladder only communicated in dark mode. The light steps
 * are deliberately one stop deeper than their dark counterparts look.
 */
describe('band tints are visible in BOTH themes', () => {
  for (let band = 1; band <= 6; band++) {
    it(`band ${band} carries a light surface wash a white panel can show`, () => {
      const config = getBandConfig(band);

      expect(config.bg, 'dark wash missing').toMatch(/\bbg-\w+-500\/10\b/);
      expect(config.bg, 'light wash missing or too pale').toMatch(/\blight:bg-\w+-100\b/);
      // -50 on white is the invisible case this whole block exists to stop.
      expect(config.bg).not.toMatch(/\blight:bg-\w+-50\b/);
    });

    it(`band ${band}'s icon tile still steps above that wash in light mode`, () => {
      const config = getBandConfig(band);

      expect(config.iconBg).toMatch(/\bbg-\w+-500\/20\b/);
      // One stop deeper than `bg`, mirroring the dark /10 → /20 relationship.
      expect(config.iconBg).toMatch(/\blight:bg-\w+-200\b/);
    });
  }
});

/**
 * Band 3 is the only band that inverts its solid pairing — dark text on a light
 * fill, because yellow is far too light to carry white. That makes it the only
 * band a tidy-up is likely to "correct" back into line with its neighbours, and
 * the numbers below are the argument against doing so.
 */
describe('band 3\'s solid pairing', () => {
  it('uses text-yellow-950, because -900 fails AA on the light fill', () => {
    const band3 = getBandConfig(3);

    // Measured in Chromium on the three chips that wear this pairing — the
    // SyllabusNavBar breadcrumb chip, PromptSelector's question chip and the
    // ribbon's selected verb chip — not calculated:
    //
    //   text-yellow-900 (#713f12) on bg-yellow-500 (#eab308, dark)  = 4.52:1
    //   text-yellow-900 (#713f12) on bg-amber-500  (#f59e0b, light) = 4.04:1  ✗
    //   text-yellow-950 (#422006) on bg-yellow-500 (#eab308, dark)  = 7.60:1
    //   text-yellow-950 (#422006) on bg-amber-500  (#f59e0b, light) = 6.79:1
    //
    // The AA floor is 4.5:1, so `-900` shipped a failing light theme on all
    // three surfaces at once. Do not put it back. Darkening the FILL instead
    // makes it worse, not better: `-900` on `light:bg-amber-600` is 2.72:1.
    expect(band3.solidBg).toBe('bg-yellow-500 light:bg-amber-500');
    expect(band3.solidText).toContain('text-yellow-950');
    expect(band3.solidText).not.toMatch(/(^|\s)text-yellow-900\b/);

    // `print:` deliberately stays at -900: paper is white, and the printed
    // report leans on the border and the band number rather than on fill.
    expect(band3.solidText).toContain('print:text-yellow-900');
  });

  it('is the only band that does not pair its solid fill with white', () => {
    for (const band of [1, 2, 4, 5, 6]) {
      expect(getBandConfig(band).solidText).toBe('text-white print:text-white');
    }
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

describe('NESA-aligned band mapping (tier is the only cap)', () => {
  it('full marks on a high-tier verb reaches the tier ceiling regardless of mark count', () => {
    // 3/3 Evaluate (Tier 6) → Band 6 per NESA descriptors.
    expect(getBandForMark(3, 3, 6)).toBe(6);
    // 2/2 Evaluate → Band 6.
    expect(getBandForMark(2, 2, 6)).toBe(6);
    // 5/5 Evaluate → Band 6.
    expect(getBandForMark(5, 5, 6)).toBe(6);
  });

  it('low-tier verbs still cap the band even with full marks', () => {
    // Tier-2 verb on a 4-mark question: full marks → Band 2.
    expect(getTargetBand(4, 2)).toBe(2);
    // Tier-3 verb on a 5-mark question: full marks → Band 3.
    expect(getTargetBand(5, 3)).toBe(3);
  });

  it('maps a 3-mark Tier-6 question to the NESA spread', () => {
    expect(getBandForMark(0, 3, 6)).toBe(1);
    expect(getBandForMark(1, 3, 6)).toBe(4);
    expect(getBandForMark(2, 3, 6)).toBe(5);
    expect(getBandForMark(3, 3, 6)).toBe(6);
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
