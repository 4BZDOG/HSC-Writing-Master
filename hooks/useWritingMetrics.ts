import { useMemo } from 'react';
import { Prompt } from '../types';
import {
  BAND_METRICS,
  getCommandTermInfo,
  getBandForMark,
  getExpectedTerms,
  getExpectedCharRange,
} from '../data/commandTerms';
import { getBandConfig, textContainsKeyword, BandConfig } from '../utils/renderUtils';
import {
  analyzeText,
  buildWritingInsights,
  TextAnalysis,
  WritingInsight,
} from '../utils/writingAnalysis';

export interface WritingMetrics {
  wordCount: number;
  charCount: number;
  /** Structural anatomy of the draft — paragraphs, sentences, run-ons. */
  analysis: TextAnalysis;
  keywordStats: { used: string[]; missed: string[]; score: number };
  progressInfo: {
    targetLabel: string;
    targetCount: number;
    /** Top of the expected range for this band — the "no longer than" figure. */
    targetCountMax: number;
    percentage: number;
    currentBandColor: BandConfig;
  };
  insights: WritingInsight[];
}

/**
 * Single source of truth for everything the workspace says about a draft in
 * progress. The Live Insights strip beside the editor and the metrics
 * dashboard below it both read from here, so the two can never disagree about
 * how long the response is, which syllabus terms have landed, or what the
 * target standard is.
 */
export const useWritingMetrics = (userAnswer: string, prompt: Prompt): WritingMetrics => {
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  const wordCount = useMemo(
    () => userAnswer.trim().split(/\s+/).filter(Boolean).length,
    [userAnswer]
  );
  const charCount = userAnswer.length;

  const expectedTerms = useMemo(
    () => getExpectedTerms(prompt.totalMarks, commandTermInfo),
    [prompt.totalMarks, commandTermInfo]
  );

  const expectedCharRange = useMemo(
    () => getExpectedCharRange(prompt.totalMarks, commandTermInfo),
    [prompt.totalMarks, commandTermInfo]
  );

  const progressInfo = useMemo(() => {
    // Same helper the marking path uses, so the live target band can't drift
    // from the band a student is actually awarded.
    const maxBand = getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier);
    const targetMetric = BAND_METRICS.find((b) => b.band === maxBand) || BAND_METRICS[0];
    // Guard against a malformed/zero-mark prompt producing a 0 target, which
    // would turn the percentage into NaN and render "NaN%".
    const targetCount = Math.max(
      1,
      Math.ceil(prompt.totalMarks * targetMetric.wordCountMultiplier.min)
    );
    // BAND_METRICS has always carried a `max` multiplier; nothing read it, so
    // "this is quite long" was measured against 1.6 × the MINIMUM instead of
    // the top of the band's own range.
    const targetCountMax = Math.max(
      targetCount,
      Math.ceil(prompt.totalMarks * targetMetric.wordCountMultiplier.max)
    );
    return {
      targetLabel: `Band ${maxBand}`,
      targetCount,
      targetCountMax,
      percentage: Math.min(100, (wordCount / targetCount) * 100),
      currentBandColor: getBandConfig(maxBand),
    };
  }, [prompt.totalMarks, commandTermInfo.tier, wordCount]);

  const keywordStats = useMemo(() => {
    const keywords = prompt.keywords || [];
    // Shares the highlighter's matcher, so the coverage score always agrees
    // with what the student sees highlighted in the writing area.
    const used = keywords.filter((kw) => textContainsKeyword(userAnswer, kw));
    return {
      used,
      missed: keywords.filter((kw) => !used.includes(kw)),
      score: keywords.length ? Math.round((used.length / keywords.length) * 100) : 0,
    };
  }, [userAnswer, prompt.keywords]);

  const analysis = useMemo(() => analyzeText(userAnswer), [userAnswer]);

  const insights = useMemo(
    () =>
      buildWritingInsights({
        analysis,
        targetWordCount: progressInfo.targetCount,
        targetWordCountMax: progressInfo.targetCountMax,
        targetLabel: progressInfo.targetLabel,
        keywordsTotal: prompt.keywords?.length || 0,
        keywordsUsed: keywordStats.used.length,
        missingKeywords: keywordStats.missed,
        expectedTerms,
        tier: commandTermInfo.tier,
        charCount,
        // Scaled to THIS question's marks, not the verb's whole span. Unscaled,
        // a 4-mark ANALYSE was judged against the 8-mark ceiling and the check
        // could never fire; at the other end a 1-mark question was flagged for
        // a perfectly ordinary sentence.
        charRange: expectedCharRange,
      }),
    [
      analysis,
      progressInfo,
      prompt.keywords,
      keywordStats,
      expectedTerms,
      expectedCharRange,
      commandTermInfo,
      charCount,
    ]
  );

  return { wordCount, charCount, analysis, keywordStats, progressInfo, insights };
};
