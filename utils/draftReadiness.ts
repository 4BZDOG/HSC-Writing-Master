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
  /** Of the total, how many the question or its syllabus names itself — these
   *  count double in the coverage sub-score. Absent (or zero) means the caller
   *  has no syllabus to judge that by, and every term weighs the same. */
  mustUseTotal?: number;
  /** How many of THOSE the draft has used. */
  mustUseUsed?: number;
  /** The question's cognitive tier (1..6). Part of the contract; not read by
   *  the score, which represents verb/criteria expectation only mechanically
   *  through keyword coverage and the tier-scaled paragraph target below. */
  tier: number;
  /** The question's already-computed target band (1..6). INPUT ONLY — never
   *  recomputed here. Used to scale `expectedParagraphs` AND to CAP the colour
   *  level (`chromaLevel`) so readiness never shows a hue above the best band
   *  the question can be awarded. */
  maxBand: number;
  /** Tier 4+ syllabus-term expectation. Part of the contract; not read by the
   *  score today (term-target prompting lives in Live Insights). */
  expectedTerms?: number;
}

export interface ReadinessResult {
  /**
   * The raw, uncalibrated completeness score, 0..100, rounded. It is the input
   * to `percent` and nothing else: no surface displays it, so the number a
   * student sees is always `percent`.
   */
  score: number;
  /**
   * The calibrated, DISPLAYED readiness, 0..100. This is the one number every
   * surface shows: the meter's bar and figure, the Evaluate button's accessible
   * name, and the editor's progress veil. It is `score` remapped from the real
   * weak→complete range (`CHROMA_FLOOR`..`CHROMA_FLOOR + CHROMA_SPAN`), so a
   * complete answer reaches 100. It is 0 exactly when `level` is 0, and never
   * above 83 while `level` is held at 5 (see `level`).
   */
  percent: number;
  /**
   * The completeness word's level, 0 neutral (empty / barely-started) else 1..6,
   * derived from `percent` in sixths. It drives the label and nothing else: the
   * number and the colour are read from `percent` and `chromaLevel`. It is NOT
   * capped by the target band, so a short question's draft can still reach
   * "Ready to submit". Level 6 is withheld (held at 5, `percent` capped at 83)
   * until the draft meets its full length and every term the question names.
   */
  level: ReadinessLevel;
  /**
   * The level used for COLOUR, derived from `level` (no separate calibration)
   * and placed on the question's OWN palette: red up to its target band, capped
   * there, so a Band-4 (green) question never shows blue or purple. The top
   * colour appears only at level 6, so "Ready to submit" and the top hue always
   * agree. 0 whenever `level` is 0. Every colour surface (meter, button, caret,
   * glow) resolves its hue from THIS via `getReadinessChroma`.
   */
  chromaLevel: ReadinessLevel;
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

/**
 * The calibration window that turns the raw score into the displayed `percent`.
 * Calibrated against the exemplar library (773 marked samples): a weak answer's
 * raw score is ~40 and a complete one's ~85, and complete answers score well
 * short of 100. So a raw score at or below `CHROMA_FLOOR` reads 0% of the way up,
 * and `CHROMA_FLOOR + CHROMA_SPAN` reads 100%. Widen the span to make a complete
 * answer harder to read as complete; raise the floor to hold weak answers lower.
 */
const CHROMA_FLOOR = 25;
const CHROMA_SPAN = 60;

/** Highest `percent` a draft can show while it is held short of level 6. */
const NEARLY_READY_CEILING = 83;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export const computeDraftReadiness = (input: ReadinessInput): ReadinessResult => {
  const {
    analysis,
    wordCount,
    targetWordCount,
    keywordsTotal,
    keywordsUsed,
    mustUseTotal = 0,
    mustUseUsed = 0,
    maxBand,
  } = input;
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
  //
  //    A term the question itself names counts DOUBLE. Flat coverage said a
  //    draft that had reached for two supporting terms was as ready as one
  //    that had answered the question in its own vocabulary, and readiness is
  //    the app's answer to "is this worth marking yet?". Weighting rather than
  //    counting must-use terms alone, so a question whose list happens to be
  //    all supporting terms keeps a working sub-score.
  const supportingTotal = Math.max(0, keywordsTotal - mustUseTotal);
  const supportingUsed = Math.max(0, keywordsUsed - mustUseUsed);
  const weightedTotal = mustUseTotal * 2 + supportingTotal;
  const keywords =
    weightedTotal > 0
      ? clamp01((mustUseUsed * 2 + supportingUsed) / weightedTotal)
      : keywordsTotal > 0
        ? clamp01(keywordsUsed / keywordsTotal)
        : Math.min(1, length);

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

  // ONE NUMBER DRIVES EVERYTHING. `percent` is the calibrated readiness; the
  // word (`level` → `label`), the meter's bar and figure, the Evaluate button's
  // name and the editor's glow/caret are all read from it, so no surface can
  // tell a student one story about the draft and a second about its colour.
  // This is a completeness signal, NOT a band prediction: nothing here knows
  // what mark the answer would earn.
  const isNeutralRaw = wordCount === 0 || score < 12;
  const fraction = clamp01((score - CHROMA_FLOOR) / CHROMA_SPAN);
  let percent = isNeutralRaw ? 0 : Math.max(1, Math.round(fraction * 100));
  let level: ReadinessLevel = isNeutralRaw
    ? 0
    : (Math.min(6, Math.max(1, Math.ceil((percent * 6) / 100))) as ReadinessLevel);

  // "Ready to submit" is a promise the draft check below it has to agree with.
  // Length is only 35% of the score, so a draft twelve words short of the
  // full-mark length could still reach the top label while the check under it
  // said "About 12 more words to reach full-mark length". The top rung waits
  // for the two things the check names by name: the length, and every term the
  // question itself is built on. Until then the draft is held at level 5 and the
  // percentage is held at 83, so "Nearly ready" never shows 84–100%.
  const meetsTheCheck = length >= 1 && mustUseUsed >= mustUseTotal;
  if (level === 6 && !meetsTheCheck) {
    level = 5;
    percent = Math.min(percent, NEARLY_READY_CEILING);
  }

  // COLOUR is derived from the same `level`, with no second calibration, so the
  // hue can never disagree with the word. It walks the question's OWN palette
  // (red → its target band) and is capped at that band: no blue or purple on a
  // green Band-4 question. The top colour is reserved for level 6, so it appears
  // exactly when the word is "Ready to submit". Level 0 stays neutral slate and
  // any real content is at least band 1 (red).
  const cap = Math.max(1, Math.min(6, Math.trunc(maxBand) || 1));
  let chromaLevel: ReadinessLevel;
  if (level === 0) chromaLevel = 0;
  else if (level === 6) chromaLevel = cap as ReadinessLevel;
  else
    chromaLevel = Math.max(
      1,
      Math.min(cap > 1 ? cap - 1 : 1, Math.round((level * cap) / 6))
    ) as ReadinessLevel;

  return {
    score,
    percent,
    level,
    chromaLevel,
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
