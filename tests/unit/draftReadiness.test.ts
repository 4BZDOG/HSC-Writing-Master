import { describe, it, expect } from 'vitest';
import type { TextAnalysis } from '../../utils/writingAnalysis';
import {
  computeDraftReadiness,
  getReadinessChroma,
  READINESS_LABELS,
  type ReadinessInput,
  type ReadinessLevel,
} from '../../utils/draftReadiness';
import { getBandHex, getBandHexDark, getBandConfig, BAND_NAMES } from '../../utils/renderUtils';

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
    expect(result.percent).toBe(0);
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
    expect(result.percent).toBe(0);
    expect(result.level).toBe(0);
    expect(result.isNeutral).toBe(true);
    expect(result.label).toBe('Start writing');
  });
});

describe('computeDraftReadiness — score → percent → level', () => {
  // `percent` is the calibrated readiness: 0% at a raw score of 25 and 100% at
  // 85. The word is `percent` in sixths: 1–16 → 1, 17–33 → 2, 34–50 → 3,
  // 51–67 → 4, 68–83 → 5, 84–100 → 6. Each case is hand-built so the raw score
  // is exact; the arithmetic behind each is noted. All four sub-scores combine
  // as 0.35·length + 0.30·keywords + 0.20·structure + 0.15·variety.

  it('score 12 is the lowest non-neutral rung: 1% and level 1', () => {
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
    expect(result.percent).toBe(1);
    expect(result.level).toBe(1);
    expect(result.label).toBe('Just beginning');
  });

  it('score 28 is still level 1: calibrated to 5%, short of level 2', () => {
    // length 80/100 = 0.8 → 0.28; everything else 0. (28 − 25) / 60 → 5%.
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
    expect(result.percent).toBe(5);
    expect(result.level).toBe(1);
  });

  it('score 44 lands on level 2 (Taking shape) at 32%', () => {
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
    expect(result.percent).toBe(32);
    expect(result.level).toBe(2);
    expect(result.label).toBe('Taking shape');
  });

  it('score 54 lands on level 3 (Coming along) at 48%', () => {
    // length 1 → 0.35; keywords 3/10 → 0.09; one paragraph against the two a
    // Band-4 question expects → structure 0.5 → 0.10.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 50,
          sentenceCount: 0,
          longestSentenceWords: 0,
          paragraphCount: 1,
        }),
        wordCount: 50,
        targetWordCount: 50,
        keywordsTotal: 10,
        keywordsUsed: 3,
        maxBand: 4,
      })
    );
    expect(result.score).toBe(54);
    expect(result.percent).toBe(48);
    expect(result.level).toBe(3);
    expect(result.label).toBe('Coming along');
  });

  it('score 60 lands on level 4 (Getting there) at 58%', () => {
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
    expect(result.percent).toBe(58);
    expect(result.level).toBe(4);
    expect(result.label).toBe('Getting there');
  });

  it('score 75 lands on level 5 (Nearly ready) at 83%', () => {
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
    expect(result.percent).toBe(83);
    expect(result.level).toBe(5);
    expect(result.label).toBe('Nearly ready');
  });

  it('score 89 lands on level 6 (Ready to submit) at 100%', () => {
    // length 2400/2400 = 1 → 0.35, keywords 19/30 → 0.19, structure 1 → 0.20,
    // variety 1 → 0.15. Full length, so the top rung's length gate is met and
    // this pins only the score boundary.
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 2400,
          sentenceCount: 5,
          longestSentenceWords: 20,
          paragraphCount: 3,
        }),
        wordCount: 2400,
        targetWordCount: 2400,
        keywordsTotal: 30,
        keywordsUsed: 19,
        maxBand: 4,
      })
    );
    expect(result.score).toBe(89);
    expect(result.percent).toBe(100);
    expect(result.level).toBe(6);
    expect(result.label).toBe('Ready to submit');
  });

  // The top label is a promise the draft check below it has to agree with. This
  // draft scores 89 while still well short of its length, and the check under the
  // meter would be asking for more words. It is held at level 5 and its percentage
  // is capped at 83, so the meter never reads 84–100% beside "Nearly ready".
  it('holds "Ready to submit" back while the draft is short of its length', () => {
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
    expect(result.percent).toBe(83);
    expect(result.level).toBe(5);
    expect(result.label).toBe('Nearly ready');
  });

  it('holds "Ready to submit" back while a term the question names is missing', () => {
    const result = computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 300,
          sentenceCount: 6,
          longestSentenceWords: 20,
          paragraphCount: 3,
        }),
        wordCount: 300,
        targetWordCount: 200,
        keywordsTotal: 10,
        keywordsUsed: 9,
        mustUseTotal: 2,
        mustUseUsed: 1,
        maxBand: 4,
      })
    );
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.percent).toBe(83);
    expect(result.label).toBe('Nearly ready');
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
    // The small target reaches 100% but is held at level 5 for want of its full
    // length, so the word can tie; the number and the raw score must not.
    expect(small.level).toBeGreaterThanOrEqual(large.level);
    expect(small.percent).toBeGreaterThan(large.percent);
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

describe('computeDraftReadiness — colour caps at, and is calibrated within, the target band', () => {
  // A fully complete draft: maxes length, keywords, structure and variety, so
  // its uncapped completeness level reaches 6 ("Ready to submit") and its score
  // saturates — it earns the TOP of whatever palette the question offers.
  const completeDraft = (maxBand: number) =>
    computeDraftReadiness(
      makeInput({
        analysis: analysis({
          wordCount: 400,
          sentenceCount: 8,
          longestSentenceWords: 22,
          paragraphCount: 5,
        }),
        wordCount: 400,
        targetWordCount: 300,
        keywordsTotal: 4,
        keywordsUsed: 4,
        maxBand,
      })
    );

  it('a complete answer reaches the top colour while the label stays uncapped', () => {
    const green = completeDraft(4); // a Band-4 (green) question
    expect(green.level).toBe(6); // completeness still tops out
    expect(green.label).toBe('Ready to submit'); // …and says so
    expect(green.chromaLevel).toBe(4); // …in the question's own top colour (green)
  });

  it('never lets a question show a hue above its target band', () => {
    for (const maxBand of [1, 2, 3, 4, 5, 6]) {
      const r = completeDraft(maxBand);
      expect(r.chromaLevel).toBeLessThanOrEqual(maxBand);
      expect(r.chromaLevel).toBe(maxBand); // a COMPLETE answer earns the top
    }
  });

  // The headline regression: a roughly half-marks answer must sit around the
  // MIDDLE of the palette, not near its top — a 2-out-of-4 response is NOT green.
  it('places a ~half-complete Band-4 answer in the middle of the palette, not green', () => {
    const half = computeDraftReadiness(
      makeInput({
        // length 100/200 = 0.5; keywords 2/4 = 0.5; structure 1 para / 2 = 0.5;
        // variety (2 sentences) = 0.6 → score ≈ 52.
        analysis: analysis({
          wordCount: 100,
          sentenceCount: 2,
          longestSentenceWords: 20,
          paragraphCount: 1,
        }),
        wordCount: 100,
        targetWordCount: 200,
        keywordsTotal: 4,
        keywordsUsed: 2,
        maxBand: 4,
      })
    );
    expect(half.chromaLevel).toBeLessThanOrEqual(2); // orange/yellow, never green
    expect(half.chromaLevel).toBeLessThan(4);
  });

  it('holds a weak, thin draft near the bottom of the palette (red)', () => {
    const thin = computeDraftReadiness(
      makeInput({
        analysis: analysis({ wordCount: 40, sentenceCount: 2, paragraphCount: 1 }),
        wordCount: 40,
        targetWordCount: 400,
        keywordsTotal: 4,
        keywordsUsed: 0,
        maxBand: 6,
      })
    );
    expect(thin.chromaLevel).toBe(1); // red — barely on the palette
    expect(thin.chromaLevel).toBeLessThan(6);
  });

  it('is monotonic: more complete never means a lower colour', () => {
    const mk = (wordCount: number, keywordsUsed: number, paragraphCount: number) =>
      computeDraftReadiness(
        makeInput({
          analysis: analysis({
            wordCount,
            sentenceCount: 4,
            longestSentenceWords: 18,
            paragraphCount,
          }),
          wordCount,
          targetWordCount: 300,
          keywordsTotal: 4,
          keywordsUsed,
          maxBand: 6,
        })
      ).chromaLevel;
    const a = mk(60, 1, 1);
    const b = mk(180, 2, 2);
    const c = mk(320, 4, 3);
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
  });

  it('keeps chromaLevel 0 (neutral) for an empty draft regardless of target band', () => {
    const empty = computeDraftReadiness(
      makeInput({
        analysis: analysis({ wordCount: 0 }),
        wordCount: 0,
        targetWordCount: 300,
        maxBand: 6,
      })
    );
    expect(empty.level).toBe(0);
    expect(empty.chromaLevel).toBe(0);
  });
});

describe('READINESS_LABELS never read as a band name', () => {
  it('no readiness label collides with a BAND_NAMES entry', () => {
    // The whole point of readiness is that it is NOT a band. A label that
    // matched a band name (as "Developing" once did) can appear beside the
    // footer's "Band N Target · <band name>" pill and read as a second band.
    const bandNames = Object.values(BAND_NAMES).map((n) => n.toLowerCase());
    for (const label of Object.values(READINESS_LABELS)) {
      expect(bandNames).not.toContain(label.toLowerCase());
    }
  });
});

/**
 * A term the question itself names counts double.
 *
 * Flat coverage said a draft that had reached for two supporting terms was as
 * ready as one that had answered the question in its own vocabulary — and
 * readiness is the app's answer to "is this worth marking yet?".
 */
describe('draft readiness weights the terms the question names', () => {
  const withTerms = (over: Partial<ReadinessInput>) =>
    computeDraftReadiness(makeInput({ keywordsTotal: 4, ...over })).score;

  it('scores a must-use term above a supporting one', () => {
    // Same draft, same number of terms used — one of them is a term the
    // question names, the other is not.
    const key = withTerms({ keywordsUsed: 1, mustUseTotal: 2, mustUseUsed: 1 });
    const supporting = withTerms({ keywordsUsed: 1, mustUseTotal: 2, mustUseUsed: 0 });
    expect(key).toBeGreaterThan(supporting);
  });

  it('leaves the score unchanged when nothing is weighted', () => {
    // No syllabus to judge by: every term weighs the same, exactly as before.
    expect(withTerms({ keywordsUsed: 2 })).toBe(
      withTerms({ keywordsUsed: 2, mustUseTotal: 0, mustUseUsed: 0 })
    );
  });

  it('still reaches full coverage when every term lands', () => {
    const all = withTerms({ keywordsUsed: 4, mustUseTotal: 2, mustUseUsed: 2 });
    const allFlat = withTerms({ keywordsUsed: 4 });
    expect(all).toBe(allFlat);
  });

  it('cannot be gamed past full coverage', () => {
    // A malformed caller claiming more must-use hits than terms used must not
    // push the sub-score above 1 and inflate readiness.
    const absurd = withTerms({ keywordsUsed: 1, mustUseTotal: 4, mustUseUsed: 9 });
    const perfect = withTerms({ keywordsUsed: 4, mustUseTotal: 4, mustUseUsed: 4 });
    expect(absurd).toBeLessThanOrEqual(perfect);
  });
});

describe('word, number and colour agree', () => {
  // A synthetic grid across every input that moves the score: length against
  // the target, keyword coverage with and without must-use terms, paragraph and
  // sentence shape (including a run-on), and every target band 1..6. Each result
  // is checked against the single-source contract: the word, the displayed
  // number and the colour all come from one level.
  const wordCounts = [0, 5, 40, 120, 300, 800, 2400];
  const targets = [50, 200, 600, 3500];
  const keywordSets = [
    { keywordsTotal: 0, keywordsUsed: 0, mustUseTotal: 0, mustUseUsed: 0 },
    { keywordsTotal: 4, keywordsUsed: 0, mustUseTotal: 0, mustUseUsed: 0 },
    { keywordsTotal: 4, keywordsUsed: 2, mustUseTotal: 2, mustUseUsed: 1 },
    { keywordsTotal: 6, keywordsUsed: 6, mustUseTotal: 2, mustUseUsed: 2 },
  ];
  const shapes = [
    { sentenceCount: 0, longestSentenceWords: 0, paragraphCount: 0 },
    { sentenceCount: 2, longestSentenceWords: 20, paragraphCount: 1 },
    { sentenceCount: 6, longestSentenceWords: 20, paragraphCount: 3 },
    { sentenceCount: 8, longestSentenceWords: 60, paragraphCount: 4 }, // a run-on
  ];
  const bands = [1, 2, 3, 4, 5, 6];

  /** Every result in the grid, tagged with the band it was computed for. */
  const sweep = () => {
    const out: Array<{ maxBand: number; r: ReturnType<typeof computeDraftReadiness> }> = [];
    for (const maxBand of bands)
      for (const wordCount of wordCounts)
        for (const targetWordCount of targets)
          for (const keys of keywordSets)
            for (const shape of shapes)
              out.push({
                maxBand,
                r: computeDraftReadiness(
                  makeInput({
                    analysis: analysis({
                      wordCount,
                      sentenceCount: shape.sentenceCount,
                      longestSentenceWords: shape.longestSentenceWords,
                      paragraphCount: shape.paragraphCount,
                    }),
                    wordCount,
                    targetWordCount,
                    ...keys,
                    maxBand,
                  })
                ),
              });
    return out;
  };

  it('every result: word, number and colour agree, and the bands line up', () => {
    const violations: string[] = [];
    const seenLevels = new Set<number>();
    const chromaByLevel = new Map<number, Map<number, Set<number>>>();

    for (const { maxBand, r } of sweep()) {
      const cap = maxBand; // every maxBand here is already within 1..6
      const tag = `maxBand=${maxBand} score=${r.score} percent=${r.percent} level=${r.level} chroma=${r.chromaLevel}`;
      seenLevels.add(r.level);

      if (r.label !== READINESS_LABELS[r.level]) violations.push(`label mismatch: ${tag}`);
      const neutral = r.level === 0;
      if (neutral !== (r.percent === 0) || neutral !== (r.chromaLevel === 0))
        violations.push(`level 0 ⇔ percent 0 ⇔ chroma 0 broken: ${tag}`);
      if (r.chromaLevel > cap) violations.push(`chroma above target band: ${tag}`);
      if (!neutral && r.chromaLevel < 1) violations.push(`non-neutral chroma below 1: ${tag}`);
      if (cap > 1 && (r.chromaLevel === cap) !== (r.level === 6))
        violations.push(`top colour ⇔ level 6 broken: ${tag}`);
      if (r.level === 6 && r.percent < 84) violations.push(`level 6 below 84%: ${tag}`);
      if (r.level === 5 && (r.percent < 67 || r.percent > 83))
        violations.push(`level 5 outside 67–83%: ${tag}`);

      if (!chromaByLevel.has(maxBand)) chromaByLevel.set(maxBand, new Map());
      const byLevel = chromaByLevel.get(maxBand)!;
      if (!byLevel.has(r.level)) byLevel.set(r.level, new Set());
      byLevel.get(r.level)!.add(r.chromaLevel);
    }

    expect(violations).toEqual([]);
    // The grid must actually reach every rung, or the checks above prove little.
    expect([...seenLevels].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('colour is non-decreasing as the level rises, for a fixed target band', () => {
    const violations: string[] = [];
    const chromaByLevel = new Map<number, Map<number, Set<number>>>();
    for (const { maxBand, r } of sweep()) {
      if (!chromaByLevel.has(maxBand)) chromaByLevel.set(maxBand, new Map());
      const byLevel = chromaByLevel.get(maxBand)!;
      if (!byLevel.has(r.level)) byLevel.set(r.level, new Set());
      byLevel.get(r.level)!.add(r.chromaLevel);
    }
    for (const [maxBand, byLevel] of chromaByLevel) {
      // One colour per level for a given band: the hue is a function of the word.
      for (const [level, chromas] of byLevel)
        if (chromas.size !== 1)
          violations.push(`band ${maxBand} level ${level} has ${chromas.size} colours`);
      const levels = [...byLevel.keys()].sort((a, b) => a - b);
      for (let i = 1; i < levels.length; i++) {
        const lower = [...byLevel.get(levels[i - 1])!][0];
        const higher = [...byLevel.get(levels[i])!][0];
        if (higher < lower)
          violations.push(
            `band ${maxBand}: level ${levels[i]} is ${higher}, below level ${levels[i - 1]} at ${lower}`
          );
      }
    }
    expect(violations).toEqual([]);
  });
});
