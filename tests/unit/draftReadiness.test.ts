import { describe, it, expect } from 'vitest';
import type { TextAnalysis } from '../../utils/writingAnalysis';
import {
  computeDraftReadiness,
  getReadinessChroma,
  READINESS_LABELS,
  type ReadinessInput,
  type ReadinessLevel,
} from '../../utils/draftReadiness';
import {
  getBandHex,
  getBandHexDark,
  getBandConfig,
} from '../../utils/renderUtils';

/**
 * Readiness is a MECHANICAL completeness signal, never a predicted band. These
 * tests hand `computeDraftReadiness` hand-built `TextAnalysis` objects so each
 * of the four sub-scores can be isolated and the score → level mapping pinned
 * exactly. The colour tests lock the "reuse the canonical palette, define no
 * new band hex" rule.
 */

/** A TextAnalysis with every field controllable; sensible defaults. */
const analysis = (over: Partial<TextAnalysis> = {}): TextAnalysis => ({
  wordCount: 100,
  sentenceCount: 5,
  avgWordsPerSentence: 20,
  longestSentenceWords: 20,
  paragraphCount: 3,
  ...over,
});

const makeInput = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  analysis: analysis(),
  wordCount: 100,
  targetWordCount: 100,
  targetWordCountMax: 160,
  keywordsTotal: 0,
  keywordsUsed: 0,
  tier: 4,
  maxBand: 4,
  ...over,
});

describe('computeDraftReadiness — the neutral guarantee', () => {
  it('returns level 0 / neutral / score 0 / "Start writing" for an empty draft', () => {
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 0,
          sentenceCount: 0,
          avgWordsPerSentence: 0,
          longestSentenceWords: 0,
          paragraphCount: 0,
        }),
        wordCount: 0,
        keywordsTotal: 3,
        keywordsUsed: 0,
      })
    );
    expect(result.level).toBe(0);
    expect(result.isNeutral).toBe(true);
    expect(result.score).toBe(0);
    expect(result.label).toBe('Start writing');
    expect(result.label).toBe(READINESS_LABELS[0]);
  });

  it('keeps a barely-started draft (score < 12) neutral, not red/level 1', () => {
    // A handful of words: length 5/100 = 0.05 (0.0175), one sentence → variety
    // 0.3 (0.045), no keywords used, no paragraph structure. raw ≈ 0.0625 → 6.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 5,
          sentenceCount: 1,
          longestSentenceWords: 5,
          paragraphCount: 0,
        }),
        wordCount: 5,
        targetWordCount: 100,
        keywordsTotal: 1,
        keywordsUsed: 0,
      })
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(12);
    expect(result.level).toBe(0);
    expect(result.isNeutral).toBe(true);
    expect(result.label).toBe('Start writing');
  });
});

describe('computeDraftReadiness — score → level thresholds', () => {
  // Each case is hand-built to land on the exact boundary score of a band, so
  // the inclusive ranges (12–27 → 1 … 89–100 → 6) are pinned precisely. The
  // arithmetic behind each is noted; all four sub-scores combine as
  // 0.35·length + 0.30·keywords + 0.20·structure + 0.15·variety.

  it('score 12 lands on level 1 (Just beginning)', () => {
    // length 12/35 = 0.342857 → 0.12; everything else 0.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 12,
          sentenceCount: 0,
          longestSentenceWords: 0,
          paragraphCount: 0,
        }),
        wordCount: 12,
        targetWordCount: 35,
        keywordsTotal: 1,
        keywordsUsed: 0,
      })
    );
    expect(result.score).toBe(12);
    expect(result.level).toBe(1);
    expect(result.label).toBe('Just beginning');
  });

  it('score 28 lands on level 2 (Taking shape)', () => {
    // length 80/100 = 0.8 → 0.28; everything else 0.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 80,
          sentenceCount: 0,
          longestSentenceWords: 0,
          paragraphCount: 0,
        }),
        wordCount: 80,
        targetWordCount: 100,
        keywordsTotal: 1,
        keywordsUsed: 0,
      })
    );
    expect(result.score).toBe(28);
    expect(result.level).toBe(2);
    expect(result.label).toBe('Taking shape');
  });

  it('score 44 lands on level 3 (Developing)', () => {
    // length 1 → 0.35, keywords 3/10 = 0.3 → 0.09; structure/variety 0.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 50,
          sentenceCount: 0,
          longestSentenceWords: 0,
          paragraphCount: 0,
        }),
        wordCount: 50,
        targetWordCount: 50,
        keywordsTotal: 10,
        keywordsUsed: 3,
      })
    );
    expect(result.score).toBe(44);
    expect(result.level).toBe(3);
    expect(result.label).toBe('Developing');
  });

  it('score 60 lands on level 4 (Getting there)', () => {
    // length 500/700 = 5/7 → 0.25, structure 1 → 0.20, variety 1 → 0.15.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 500,
          sentenceCount: 5,
          longestSentenceWords: 20,
          paragraphCount: 3,
        }),
        wordCount: 500,
        targetWordCount: 700,
        keywordsTotal: 1,
        keywordsUsed: 0,
        maxBand: 4,
      })
    );
    expect(result.score).toBe(60);
    expect(result.level).toBe(4);
    expect(result.label).toBe('Getting there');
  });

  it('score 75 lands on level 5 (Nearly ready)', () => {
    // length 200/700 = 2/7 → 0.10, keywords 1 → 0.30, structure 1 → 0.20,
    // variety 1 → 0.15.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 200,
          sentenceCount: 5,
          longestSentenceWords: 20,
          paragraphCount: 3,
        }),
        wordCount: 200,
        targetWordCount: 700,
        keywordsTotal: 1,
        keywordsUsed: 1,
        maxBand: 4,
      })
    );
    expect(result.score).toBe(75);
    expect(result.level).toBe(5);
    expect(result.label).toBe('Nearly ready');
  });

  it('score 89 lands on level 6 (Ready to submit)', () => {
    // length 2400/3500 = 24/35 → 0.24, keywords 1 → 0.30, structure 1 → 0.20,
    // variety 1 → 0.15.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 2400,
          sentenceCount: 5,
          longestSentenceWords: 20,
          paragraphCount: 3,
        }),
        wordCount: 2400,
        targetWordCount: 3500,
        keywordsTotal: 1,
        keywordsUsed: 1,
        maxBand: 4,
      })
    );
    expect(result.score).toBe(89);
    expect(result.level).toBe(6);
    expect(result.label).toBe('Ready to submit');
  });

  it('a full, well-structured draft reaches the top of the palette (5/6)', () => {
    // Everything maxed: length 1, keywords all, plenty of paragraphs, varied
    // sentences → score ≥ 89.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 300,
          sentenceCount: 8,
          longestSentenceWords: 24,
          paragraphCount: 4,
        }),
        wordCount: 300,
        targetWordCount: 250,
        keywordsTotal: 5,
        keywordsUsed: 5,
        maxBand: 6,
      })
    );
    expect(result.level).toBeGreaterThanOrEqual(5);
  });
});

describe("computeDraftReadiness — it reads the question's OWN target", () => {
  it('gives the SAME word count a higher level for a small target than a large one', () => {
    const base = {
      analysis: analysis({
        wordCount: 80,
        sentenceCount: 5,
        longestSentenceWords: 20,
        paragraphCount: 3,
      }),
      wordCount: 80,
      keywordsTotal: 1,
      keywordsUsed: 1,
      maxBand: 4,
    };
    const small = computeDraftReadiness(makeInput({ ...base, targetWordCount: 100 }));
    const large = computeDraftReadiness(makeInput({ ...base, targetWordCount: 1600 }));

    // 80 words is near-complete for a 100-word question but barely begun for a
    // 1600-word one, so the same draft is more "ready" against the small target.
    expect(small.level).toBeGreaterThan(large.level);
    expect(small.score).toBeGreaterThan(large.score);
    expect(small.subscores.length).toBeGreaterThan(large.subscores.length);
  });
});

describe('computeDraftReadiness — keyword fallback', () => {
  it('uses the length sub-score for keywords when the prompt has no keywords', () => {
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({ wordCount: 40 }),
        wordCount: 40,
        targetWordCount: 100,
        keywordsTotal: 0,
        keywordsUsed: 0,
      })
    );
    // keywords falls back to min(1, length); here length < 1, so they are equal.
    expect(result.subscores.keywords).toBe(result.subscores.length);
  });

  it('still climbs with length when there are no keywords', () => {
    const shorter = computeDraftReadiness(
      makeInput({
        analysis: analysis({ wordCount: 30 }),
        wordCount: 30,
        targetWordCount: 200,
        keywordsTotal: 0,
      })
    );
    const longer = computeDraftReadiness(
      makeInput({
        analysis: analysis({ wordCount: 120 }),
        wordCount: 120,
        targetWordCount: 200,
        keywordsTotal: 0,
      })
    );
    expect(longer.score).toBeGreaterThan(shorter.score);
  });
});

describe('computeDraftReadiness — a run-on weakens structure and variety', () => {
  it('lowers both the structure and variety sub-scores when one sentence runs on', () => {
    const shared = {
      wordCount: 120,
      targetWordCount: 120,
      keywordsTotal: 2,
      keywordsUsed: 2,
      maxBand: 5,
    };
    const tidy = computeDraftReadiness(
      makeInput({
        ...shared,
        analysis: analysis({
          wordCount: 120,
          sentenceCount: 5,
          longestSentenceWords: 20, // within the run-on threshold
          paragraphCount: 3,
        }),
      })
    );
    const runOn = computeDraftReadiness(
      makeInput({
        ...shared,
        analysis: analysis({
          wordCount: 120,
          sentenceCount: 5,
          longestSentenceWords: 60, // > 45, a wall of one sentence
          paragraphCount: 3,
        }),
      })
    );

    // structure is multiplied by 0.7, and variety drops off its top rung.
    expect(runOn.subscores.structure).toBeLessThan(tidy.subscores.structure);
    expect(runOn.subscores.variety).toBeLessThan(tidy.subscores.variety);
    expect(runOn.score).toBeLessThan(tidy.score);
  });
});

describe('getReadinessChroma — reuse the canonical palette, define no new band hex', () => {
  for (const level of [1, 2, 3, 4, 5, 6] as ReadinessLevel[]) {
    it(`level ${level} delegates to the canonical band helpers`, () => {
      const chroma = getReadinessChroma(level);
      expect(chroma.isNeutral).toBe(false);
      expect(chroma.hex).toBe(getBandHex(level));
      expect(chroma.hexDark).toBe(getBandHexDark(level));
      expect(chroma.config).toEqual(getBandConfig(level));
    });
  }

  it('level 0 is a neutral slate that is NOT any band colour', () => {
    const chroma = getReadinessChroma(0);
    expect(chroma.isNeutral).toBe(true);
    const bandHexes = [1, 2, 3, 4, 5, 6].map((b) => getBandHex(b));
    expect(bandHexes).not.toContain(chroma.hex);
    expect(bandHexes).not.toContain(chroma.hexDark);
    // A recognisable slate, not one of the six band configs.
    expect(chroma.hex).toBe('#64748b');
  });
});
