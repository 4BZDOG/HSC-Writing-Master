import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import {
  getBandForMark,
  getExpectedTerms,
  getFullMarkWordRange,
  getPromptTermInfo,
} from '../../data/commandTerms';
import { textContainsKeyword } from '../../utils/renderUtils';
import { analyzeText } from '../../utils/writingAnalysis';
import { computeDraftReadiness } from '../../utils/draftReadiness';
import { splitSyllabusTerms } from '../../utils/syllabusTermSource';

/**
 * The live feedback button must never glow a colour above the sample answer a
 * draft matches. Every shipped sample answer is run through the readiness model
 * exactly as `hooks/useWritingMetrics.ts` runs a student's draft, and its colour
 * (`chromaLevel`) is held to the sample's own band.
 *
 * Below "Ready to submit" the rule has no exceptions; `CHROMA_CEILING` in
 * `utils/draftReadiness.ts` is calibrated from this same data. "Ready to submit"
 * keeps the question's top colour, because it needs full length and every term
 * the question names; a handful of lower-mark samples are written that
 * completely, and they are pinned here by count so a new one is noticed.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = join(process.cwd(), 'public/courseData');
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

/** Lower-mark samples that reach "Ready to submit" (all one band below the top). */
const KNOWN_READY_EXCEPTIONS = 3;

interface Case {
  id: string;
  level: number;
  chroma: number;
  band: number;
}

const cases: Case[] = [];
for (const entry of manifest.entries.filter((e: any) => e.type === 'course')) {
  const raw = JSON.parse(readFileSync(join(ROOT, entry.file), 'utf8'));
  const course = Array.isArray(raw) ? raw[0] : raw;
  for (const topic of course.topics)
    for (const sub of topic.subTopics)
      for (const dp of sub.dotPoints)
        for (const p of dp.prompts) {
          const info = getPromptTermInfo(p);
          const maxBand = getBandForMark(p.totalMarks, p.totalMarks, info.tier);
          const [minW, maxW] = getFullMarkWordRange(p.totalMarks);
          const keywords: string[] = p.keywords || [];
          const split = splitSyllabusTerms(keywords, {
            question: p.question,
            scenario: p.scenario,
            topicName: topic.name,
            subTopicName: sub.name,
            dotPointText: dp.description,
          });
          for (const s of p.sampleAnswers || []) {
            if (s.prescribedText || !s.answer) continue;
            const used = (k: string) => textContainsKeyword(s.answer, k);
            const r = computeDraftReadiness({
              analysis: analyzeText(s.answer),
              wordCount: s.answer.trim().split(/\s+/).filter(Boolean).length,
              targetWordCount: Math.max(1, minW),
              targetWordCountMax: Math.max(minW, maxW),
              keywordsTotal: keywords.length,
              keywordsUsed: keywords.filter(used).length,
              mustUseTotal: split.mustUse.length,
              mustUseUsed: split.mustUse.filter(used).length,
              tier: info.tier,
              maxBand,
              expectedTerms: getExpectedTerms(p.totalMarks, info),
            });
            cases.push({
              id: `${p.id} (${s.mark}/${p.totalMarks})`,
              level: r.level,
              chroma: r.chromaLevel,
              band: getBandForMark(s.mark, p.totalMarks, info.tier),
            });
          }
        }
}

describe('live feedback colour against the shipped sample answers', () => {
  it('measures a meaningful share of the library', () => {
    expect(cases.length).toBeGreaterThan(10000);
  });

  it('never shows a colour above the sample’s band below "Ready to submit"', () => {
    const over = cases.filter((c) => c.level < 6 && c.chroma > c.band);
    expect(over.slice(0, 10).map((c) => `${c.id}: colour ${c.chroma} > band ${c.band}`)).toEqual(
      []
    );
  });

  it('keeps "Ready to submit" exceptions to the known few, each one band below the top', () => {
    const over = cases.filter((c) => c.level === 6 && c.chroma > c.band);
    expect(over.length).toBeLessThanOrEqual(KNOWN_READY_EXCEPTIONS);
    for (const c of over) expect(c.chroma - c.band).toBe(1);
  });
});
