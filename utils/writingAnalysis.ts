/**
 * Pure helpers for live writing feedback. Kept free of React/DOM so the logic
 * can be unit-tested and reused. `analyzeText` derives structural metrics from
 * the draft; `buildWritingInsights` turns those (plus prompt context computed
 * by the caller) into a short, prioritised list of actionable prompts.
 */

export interface TextAnalysis {
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  longestSentenceWords: number;
  paragraphCount: number;
}

const countWords = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

export const analyzeText = (text: string): TextAnalysis => {
  const clean = (text || '').trim();
  if (!clean) {
    return {
      wordCount: 0,
      sentenceCount: 0,
      avgWordsPerSentence: 0,
      longestSentenceWords: 0,
      paragraphCount: 0,
    };
  }

  const wordCount = countWords(clean);

  // Split into sentences on terminal punctuation; fall back to the whole text
  // when the writer hasn't punctuated yet (so a long unpunctuated draft still
  // registers as one very long sentence).
  const sentences = clean
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const sentenceCount = sentences.length || 1;

  let longestSentenceWords = 0;
  for (const sentence of sentences) {
    const w = countWords(sentence);
    if (w > longestSentenceWords) longestSentenceWords = w;
  }
  if (sentences.length === 0) longestSentenceWords = wordCount;

  const paragraphCount = clean.split(/\n\s*\n/).filter((p) => p.trim()).length || 1;

  return {
    wordCount,
    sentenceCount,
    avgWordsPerSentence: Math.round(wordCount / sentenceCount),
    longestSentenceWords,
    paragraphCount,
  };
};

export type InsightTone = 'positive' | 'warning' | 'info';

export interface WritingInsight {
  id: string;
  tone: InsightTone;
  message: string;
}

export interface InsightInput {
  analysis: TextAnalysis;
  /** Lower end of the expected length — the target a short draft works toward. */
  targetWordCount: number;
  /**
   * Upper end of the expected length. Omitted, it falls back to 1.6 × the
   * minimum, which is what the "too long" warning used before there was an
   * upper bound to consult.
   */
  targetWordCountMax?: number;
  targetLabel: string;
  keywordsTotal: number;
  keywordsUsed: number;
  missingKeywords: string[];
  expectedTerms?: number;
  tier?: number;
  charCount?: number;
  charRange?: [number, number];
}

const RUN_ON_SENTENCE_WORDS = 45;
const MAX_INSIGHTS = 4;
/**
 * No draft shorter than this is ever called "long", whatever the arithmetic
 * says. A 2-mark question targets ~16 words, so 1.6 × the target used to
 * trigger the warning at 26 — telling a student who had written two sensible
 * sentences to cut them back.
 */
const MIN_WORDS_BEFORE_LONG = 60;
/** How far past the top of the expected range counts as genuinely overlong. */
const LONG_TOLERANCE = 1.15;

/**
 * Builds a prioritised list of live writing insights. Warnings about
 * fundamentals come first; a single positive is shown when the draft is in
 * good shape. Returns an empty list for a blank draft.
 */
export const buildWritingInsights = (input: InsightInput): WritingInsight[] => {
  const {
    analysis,
    targetWordCount,
    targetWordCountMax,
    targetLabel,
    keywordsTotal,
    keywordsUsed,
    missingKeywords,
    expectedTerms,
    tier,
    charCount,
    charRange,
  } = input;
  const { wordCount, longestSentenceWords, paragraphCount } = analysis;

  if (wordCount === 0) return [];

  const warnings: WritingInsight[] = [];
  const positives: WritingInsight[] = [];

  // --- Length ---
  // Three states, and the character check below defers to them: telling a
  // student to write more AND to tighten their expression in the same breath
  // is the contradiction this used to produce.
  let lengthState: 'short' | 'good' | 'long' = 'good';
  if (targetWordCount > 0) {
    // The top of the expected range, not 1.6 × the bottom of it.
    const upper = Math.max(
      targetWordCount,
      Math.round(targetWordCountMax ?? targetWordCount * 1.6)
    );
    const remaining = targetWordCount - wordCount;
    if (wordCount < targetWordCount * 0.95) {
      lengthState = 'short';
      warnings.push({
        id: 'length-short',
        tone: remaining > targetWordCount * 0.5 ? 'warning' : 'info',
        message: `About ${Math.max(1, remaining)} more words to reach ${targetLabel} length.`,
      });
    } else if (wordCount > upper * LONG_TOLERANCE && wordCount > MIN_WORDS_BEFORE_LONG) {
      lengthState = 'long';
      warnings.push({
        id: 'length-long',
        tone: 'warning',
        message: `At ${wordCount} words this runs past the ${targetLabel} range (about ${upper}) — make sure every sentence earns marks.`,
      });
    } else {
      positives.push({
        id: 'length-good',
        tone: 'positive',
        message: `Strong length for a ${targetLabel} response.`,
      });
    }
  }

  // --- Character range (soft boundary) ---
  // A second opinion on verbosity, in the verb's own units: a response can sit
  // inside the word target and still be twice as long on the page. Only ever
  // raised when the word count itself says nothing — beside "write more" it
  // contradicts, and beside "this is too long" it is the same note twice.
  if (lengthState === 'good' && charCount !== undefined && charRange && charRange[1] > 0) {
    if (charCount > charRange[1] * 1.3) {
      warnings.push({
        id: 'chars-over',
        tone: 'warning',
        message: `Longer than this verb usually needs — tighten your expression.`,
      });
    }
  }

  // --- Syllabus keywords ---
  if (keywordsTotal > 0) {
    if (keywordsUsed < keywordsTotal) {
      const missing = missingKeywords.length;
      const examples = missingKeywords.slice(0, 2).join(', ');
      warnings.push({
        id: 'keywords-missing',
        tone: 'warning',
        message: `Weave in ${missing} more syllabus term${missing === 1 ? '' : 's'}${
          examples ? `: ${examples}${missing > 2 ? '…' : ''}` : ''
        }.`,
      });
    } else {
      positives.push({
        id: 'keywords-all',
        tone: 'positive',
        message: `All syllabus terms covered — strong content coverage.`,
      });
    }
  }

  // --- Syllabus term target prompt (Tier 4+) ---
  if (
    tier &&
    tier >= 4 &&
    expectedTerms &&
    expectedTerms > 0 &&
    keywordsUsed < expectedTerms &&
    keywordsTotal > 0 &&
    wordCount > targetWordCount * 0.4
  ) {
    warnings.push({
      id: 'terms-target',
      tone: 'info',
      message: `Band ${tier} tasks expect ${expectedTerms}+ syllabus terms — have you used enough?`,
    });
  }

  // --- Run-on sentence ---
  if (longestSentenceWords > RUN_ON_SENTENCE_WORDS) {
    warnings.push({
      id: 'run-on',
      tone: 'warning',
      message: `One sentence runs to ${longestSentenceWords} words — consider splitting it for clarity.`,
    });
  }

  // --- Paragraphing ---
  if (wordCount > 130 && paragraphCount < 2) {
    warnings.push({
      id: 'paragraphs',
      tone: 'info',
      message: `Break this into paragraphs to structure your argument.`,
    });
  }

  // --- Structure prompts for Tier 5-6 ---
  if (tier && tier >= 5 && wordCount > 60 && paragraphCount >= 2 && paragraphCount < 3) {
    positives.push({
      id: 'structure-hint',
      tone: 'info',
      message: `High-band tasks benefit from clear sections: intro, body of argument, and conclusion.`,
    });
  }

  const combined = [...warnings, ...positives];
  // If everything is healthy, surface a single encouraging insight.
  if (combined.length === 0) {
    return [
      {
        id: 'all-good',
        tone: 'positive',
        message: `Looking strong — focus on sharpening your argument.`,
      },
    ];
  }

  return combined.slice(0, MAX_INSIGHTS);
};
