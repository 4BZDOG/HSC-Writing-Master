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
  targetWordCount: number;
  targetLabel: string;
  keywordsTotal: number;
  keywordsUsed: number;
  missingKeywords: string[];
  connectorsUsed: number;
}

const RUN_ON_SENTENCE_WORDS = 45;
const MAX_INSIGHTS = 4;

/**
 * Builds a prioritised list of live writing insights. Warnings about
 * fundamentals come first; a single positive is shown when the draft is in
 * good shape. Returns an empty list for a blank draft.
 */
export const buildWritingInsights = (input: InsightInput): WritingInsight[] => {
  const {
    analysis,
    targetWordCount,
    targetLabel,
    keywordsTotal,
    keywordsUsed,
    missingKeywords,
    connectorsUsed,
  } = input;
  const { wordCount, longestSentenceWords, paragraphCount } = analysis;

  if (wordCount === 0) return [];

  const warnings: WritingInsight[] = [];
  const positives: WritingInsight[] = [];

  // --- Length ---
  if (targetWordCount > 0) {
    const remaining = targetWordCount - wordCount;
    if (wordCount < targetWordCount * 0.95) {
      warnings.push({
        id: 'length-short',
        tone: remaining > targetWordCount * 0.5 ? 'warning' : 'info',
        message: `About ${Math.max(1, remaining)} more words to reach ${targetLabel} length.`,
      });
    } else if (wordCount > targetWordCount * 1.6) {
      warnings.push({
        id: 'length-long',
        tone: 'warning',
        message: `This is quite long — make sure every sentence earns marks.`,
      });
    } else {
      positives.push({
        id: 'length-good',
        tone: 'positive',
        message: `Strong length for a ${targetLabel} response.`,
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

  // --- Logic connectors ---
  if (connectorsUsed === 0 && wordCount > 30) {
    warnings.push({
      id: 'connectors-none',
      tone: 'warning',
      message: `Link your ideas with a logic connector (e.g. “Therefore”, “However”).`,
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
