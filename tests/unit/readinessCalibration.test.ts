import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeText } from '../../utils/writingAnalysis';
import { computeDraftReadiness } from '../../utils/draftReadiness';
import { getBandForMark, getCommandTermInfo, BAND_METRICS } from '../../data/commandTerms';
import { textContainsKeyword } from '../../utils/renderUtils';

/**
 * The live readiness glow, measured against every marked exemplar we ship.
 *
 * `CHROMA_FLOOR` and `CHROMA_SPAN` were described in the source as "calibrated
 * against the exemplar library (773 marked samples)" — a number nobody could
 * reproduce and therefore nobody could re-derive when the library grew. This
 * file is that calibration, run as a test.
 *
 * What it found is why the cap exists. The readiness score does NOT separate
 * the top bands: it peaks around Band 3 and falls away, and every band from 1
 * to 6 has exemplars scoring a full 100. That is not a mistuned window — it is
 * what the signal is made of. Length, paragraph structure, keyword coverage and
 * sentence variety are all things a thorough but unconvincing answer does well,
 * so no remapping of the score can make the top of the palette mean "Band 6".
 * The colour therefore stops one band below the question's ceiling, and these
 * assertions are what stop that slipping back.
 */

interface Sample {
  band: number;
  score: number;
  chroma: number;
  maxBand: number;
}

const library = (): Sample[] => {
  const dir = resolve(__dirname, '../../public/courseData');
  const out: Sample[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
    const parsed = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    for (const course of Array.isArray(parsed) ? parsed : [parsed])
      for (const topic of course.topics || [])
        for (const sub of topic.subTopics || [])
          for (const dp of sub.dotPoints || [])
            for (const prompt of dp.prompts || []) {
              const total = prompt.totalMarks || 0;
              if (!total) continue;
              const tier = getCommandTermInfo(prompt.verb).tier;
              const maxBand = getBandForMark(total, total, tier);
              const metric = BAND_METRICS.find((b) => b.band === maxBand) || BAND_METRICS[0];
              const targetWordCount = Math.max(
                1,
                Math.ceil(total * metric.wordCountMultiplier.min)
              );
              const keywords: string[] = (prompt.keywords || []).filter(Boolean);
              for (const sa of prompt.sampleAnswers || []) {
                const text: string = sa.answer || '';
                if (!text.trim() || typeof sa.mark !== 'number') continue;
                const r = computeDraftReadiness({
                  analysis: analyzeText(text),
                  wordCount: text.trim().split(/\s+/).filter(Boolean).length,
                  targetWordCount,
                  targetWordCountMax: Math.max(
                    targetWordCount,
                    Math.ceil(total * metric.wordCountMultiplier.max)
                  ),
                  keywordsTotal: keywords.length,
                  keywordsUsed: keywords.filter((kw) => textContainsKeyword(text, kw)).length,
                  tier,
                  maxBand,
                });
                out.push({
                  band: getBandForMark(sa.mark, total, tier),
                  score: r.score,
                  chroma: r.chromaLevel,
                  maxBand,
                });
              }
            }
  }
  return out;
};

describe('the readiness glow, against the shipped exemplar library', () => {
  const samples = library();

  it('has enough exemplars to calibrate against', () => {
    // If the library is ever emptied or the traversal breaks, every assertion
    // below would pass vacuously on an empty array.
    expect(samples.length).toBeGreaterThan(500);
  });

  it('never paints the question’s ceiling band', () => {
    // The complaint that prompted the cap: a response worth 3/6 glowing in the
    // Band 5 hue, because it was long, structured and full of syllabus terms.
    // A question with a ceiling to drop below must never show that ceiling.
    const claims = samples.filter((s) => s.maxBand > 1 && s.chroma >= s.maxBand);
    expect(claims).toEqual([]);
  });

  it('still lets a strong draft reach the top colour it is allowed', () => {
    // The opposite failure: a cap so tight, or a span so wide, that the accent
    // never moves. Some exemplar must reach the capped top.
    const reachable = samples.filter((s) => s.maxBand > 1 && s.chroma === s.maxBand - 1);
    expect(reachable.length).toBeGreaterThan(0);
  });

  it('is not fooled into the top colour by a Band 1 answer', () => {
    // Band 1 exemplars scoring 100 are exactly why the cap is not enough on its
    // own and the floor was raised too. None of them may sit at the top of the
    // palette of a question that has more than a couple of bands.
    const overclaimed = samples.filter((s) => s.band <= 1 && s.maxBand >= 4 && s.chroma >= 3);
    expect(overclaimed).toEqual([]);
  });

  it('rises with the band rather than peaking in the middle', () => {
    // The score alone does not do this — it peaks at Band 3. The ladder and the
    // raised floor together do. Compared at the ends rather than pairwise: the
    // library has far fewer exemplars at the top, so adjacent bands are noisy.
    const mean = (band: number) => {
      const rows = samples.filter((s) => s.band === band);
      return rows.length ? rows.reduce((t, s) => t + s.chroma, 0) / rows.length : 0;
    };
    expect(mean(6)).toBeGreaterThan(mean(3));
    expect(mean(5)).toBeGreaterThan(mean(2));
    expect(mean(3)).toBeGreaterThan(mean(1));
  });
});
