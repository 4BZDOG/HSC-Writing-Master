/**
 * Pure, synchronous model for the live draft-readiness hint. Kept free of
 * React/DOM (mirrors `utils/writingAnalysis.ts`) so the logic can be unit-tested
 * and reused across surfaces.
 *
 * WHAT THIS IS, AND — MORE IMPORTANTLY — WHAT IT IS NOT.
 *
 * `computeDraftReadiness` returns a *provisional, mechanical* "how complete and
 * ready is this draft" signal, deliberately named `readinessScore` /
 * `readinessLevel` and NEVER `band`. It is computed from client-side-observable
 * targets only — length against the question's own expected length,
 * paragraph/structure, syllabus-keyword coverage, and sentence variety — not
 * from any quality judgement and not from any AI call.
 *
 * It must never be mistaken for a predicted band or mark. Real band/mark logic
 * (`getBandForMark`, the Verb Gate, `getBandForColour`, `getTargetBand`) is the
 * single source of truth for actual bands and is NOT touched, duplicated, read,
 * or fed by this module. In particular `maxBand` below is an INPUT — the
 * caller's already-computed target band for the question — used only to scale
 * how many paragraphs a strong response is expected to have. We never recompute
 * a band here.
 *
 * The readiness level merely *borrows* the app's six-step band colour palette
 * (red 1 → purple 6) as a familiar visual language, via the canonical helpers in
 * `utils/renderUtils.ts`. Level 0 sits deliberately OUTSIDE that palette (a calm
 * slate) so an empty or barely-started draft never reads as "band 1 / failing".
 */

import type { TextAnalysis } from './writingAnalysis';
import { type BandConfig, getBandConfig, getBandHex, getBandHexDark } from './renderUtils';

/** 0 is the neutral pre-writing state; 1..6 map onto the band colour palette. */
export type ReadinessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ReadinessInput {
  /** Structural metrics from `analyzeText` (utils/writingAnalysis.ts). */
  analysis: TextAnalysis;
  /** Live word count of the draft. */
  wordCount: number;
  /** The question's own target length (the minimum for its target band). */
  targetWordCount: number;
  /** The top of the expected length range. Unused by the score today (no
   *  over-length penalty here — that nudge stays in Live Insights), but part of
   *  the input contract so the caller can hand the model everything the hook
   *  already computes without reshaping it. */
  targetWordCountMax: number;
  /** How many syllabus keywords the prompt carries. */
  keywordsTotal: number;
  /** How many of those keywords the draft has used so far. */
  keywordsUsed: number;
  /** The question's cognitive tier (1..6). Part of the contract; not read by
   *  the score, which represents verb/criteria expectation only mechanically
   *  through keyword coverage and the tier-scaled paragraph target below. */
  tier: number;
  /** The question's already-computed target band (1..6). INPUT ONLY — used
   *  purely to scale `expectedParagraphs`. Never recomputed here. */
  maxBand: number;
  /** Tier 4+ syllabus-term expectation. Part of the contract; not read by the
   *  score today (term-target prompting lives in Live Insights). */
  expectedTerms?: number;
}

export interface ReadinessResult {
  /** 0..100, rounded. */
  score: number;
  /** 0 neutral (empty / barely-started); else 1..6 onto the band palette. */
  level: ReadinessLevel;
  /** True when `level === 0`. */
  isNeutral: boolean;
  /** Completeness words ("Getting there"), never a band name. */
  label: string;
  /** The four component sub-scores, each 0..1, exposed for the meter/tests. */
  subscores: { length: number; structure: number; keywords: number; variety: number };
}

/**
 * Readiness labels are deliberately DISTINCT from `BAND_NAMES`
 * (Elementary/Limited/Developing/Sound/Excellent/Outstanding, renderUtils.ts)
 * so no surface can ever be read as naming a band. These are completeness words.
 */
export const READINESS_LABELS: Record<ReadinessLevel, string> = {
  0: 'Start writing',
  1: 'Just beginning',
  2: 'Taking shape',
  3: 'Coming along',
  4: 'Getting there',
  5: 'Nearly ready',
  6: 'Ready to submit',
};

/**
 * Mirrors the (module-local, un-exported) run-on threshold in
 * `utils/writingAnalysis.ts`: a single sentence longer than this reads as a
 * wall of text, which we treat as structurally weaker here. Kept in sync by
 * value because writingAnalysis does not export the constant.
 */
const RUN_ON_SENTENCE_WORDS = 45;

/**
 * When a question carries no explicit length target, length is measured against
 * this floor so a keyword-free / target-less prompt can still progress. Chosen
 * as a plausible "a real answer is at least this long" figure rather than tied
 * to any band arithmetic.
 */
const FALLBACK_TARGET_WORDS = 100;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Maps a 0..100 readiness score to a palette level. Empty or barely-started
 * (`wordCount === 0` OR `score < 12`) returns 0 — the neutral, off-palette
 * state, so an empty box is calm rather than a red alarm. The bands are the
 * inclusive ranges from the plan (§2.3): 12–27 → 1 … 89–100 → 6.
 */
const resolveLevel = (score: number, wordCount: number): ReadinessLevel => {
  if (wordCount === 0 || score < 12) return 0;
  if (score <= 27) return 1;
  if (score <= 43) return 2;
  if (score <= 59) return 3;
  if (score <= 74) return 4;
  if (score <= 88) return 5;
  return 6;
};

export const computeDraftReadiness = (input: ReadinessInput): ReadinessResult => {
  const { analysis, wordCount, targetWordCount, keywordsTotal, keywordsUsed, maxBand } = input;
  const { sentenceCount, longestSentenceWords, paragraphCount } = analysis;

  const isRunOn = longestSentenceWords > RUN_ON_SENTENCE_WORDS;

  // 1. Length — against the QUESTION'S OWN target, so a 2-mark and a 10-mark
  //    question reach a full length sub-score at very different word counts. No
  //    over-length penalty here (the "too long" nudge stays in Live Insights).
  //    Guard divide-by-zero: with no target, measure against a sensible floor.
  const lengthDenominator = targetWordCount > 0 ? targetWordCount : FALLBACK_TARGET_WORDS;
  const length = clamp01(wordCount / lengthDenominator);

  // 2. Keywords — coverage of the syllabus terms; falls back to the length
  //    sub-score when the prompt has no keywords, so keyword-free questions
  //    still progress (same convention as the prior progressScore).
  const keywords = keywordsTotal > 0 ? clamp01(keywordsUsed / keywordsTotal) : Math.min(1, length);

  // 3. Structure — paragraphs against a tier-scaled expectation. A higher target
  //    band is expected to be organised into more paragraphs. A run-on sentence
  //    (a wall of one clause) knocks the structure sub-score back, as it is
  //    structurally weaker however many line breaks surround it.
  const expectedParagraphs = maxBand >= 5 ? 3 : maxBand >= 4 ? 2 : 1;
  let structure = clamp01(paragraphCount / expectedParagraphs);
  if (isRunOn) structure *= 0.7;

  // 4. Variety — a crude but honest "more than one sentence, none of them a
  //    runaway" check. A run-on caps the top rung.
  const variety =
    sentenceCount >= 3 && !isRunOn ? 1 : sentenceCount >= 2 ? 0.6 : sentenceCount >= 1 ? 0.3 : 0;

  const raw = 0.35 * length + 0.3 * keywords + 0.2 * structure + 0.15 * variety;
  const score = Math.round(raw * 100);

  const level = resolveLevel(score, wordCount);

  return {
    score,
    level,
    isNeutral: level === 0,
    label: READINESS_LABELS[level],
    subscores: { length, structure, keywords, variety },
  };
};

/**
 * A neutral slate that is intentionally NOT any band colour (bands run
 * red/orange/yellow/green/blue/purple; slate is none of them). Level 0 uses it
 * so an empty draft reads as "not started", never as "band 1 / failing". This
 * is the ONE hex this module introduces — everything 1..6 delegates to the
 * canonical palette helpers below and defines no new band hex.
 */
const NEUTRAL_SLATE_HEX = '#64748b'; // slate-500
const NEUTRAL_SLATE_HEX_DARK = '#475569'; // slate-600

/**
 * A `BandConfig`-shaped slate bundle for level 0, following the same
 * class-token conventions as `getBandConfig` (dark alpha wash, one-stop-deeper
 * light tints, print variants) but in slate — deliberately outside the band
 * palette.
 */
const NEUTRAL_SLATE_CONFIG: BandConfig = {
  bg: 'bg-slate-500/10 light:bg-slate-100 print:bg-slate-50',
  solidBg: 'bg-slate-600 light:bg-slate-500',
  border: 'border-slate-500/50 light:border-slate-400 print:border-slate-200',
  text: 'text-slate-400 light:text-slate-700 print:text-slate-800',
  solidText: 'text-white print:text-white',
  gradient: 'from-slate-500 to-slate-400 light:from-slate-600 light:to-slate-500',
  glow: 'shadow-slate-500/25 light:shadow-slate-500/20',
  iconBg: 'bg-slate-500/20 light:bg-slate-200 print:bg-slate-100',
  ring: 'ring-slate-500/30 light:ring-slate-400/30',
};

/**
 * Thin, pure colour bridge. Delegates levels 1..6 EXCLUSIVELY to the canonical
 * palette helpers (`getBandHex` / `getBandHexDark` / `getBandConfig`) so the
 * readiness hue can never drift from the band colours used elsewhere, and
 * defines no new band hex. Level 0 returns the off-palette neutral slate.
 */
export const getReadinessChroma = (
  level: ReadinessLevel
): { isNeutral: boolean; hex: string; hexDark: string; config: BandConfig } => {
  if (level === 0) {
    return {
      isNeutral: true,
      hex: NEUTRAL_SLATE_HEX,
      hexDark: NEUTRAL_SLATE_HEX_DARK,
      config: NEUTRAL_SLATE_CONFIG,
    };
  }
  return {
    isNeutral: false,
    hex: getBandHex(level),
    hexDark: getBandHexDark(level),
    config: getBandConfig(level),
  };
};
