/**
 * Near-duplicate detection for exemplars — the third of the volume strategy's
 * "what to do next" items (projectDocs/contentVolumeStrategy.md).
 *
 * Labelling and folding make five exemplars at one mark *readable*. They cannot
 * make the fifth one *worth reading*. When a teacher generates a second batch
 * at 6/6, the model has no memory of the first, so it writes another answer of
 * the same shape — and the library grows without getting better. The cheapest
 * fix is not to store the fifth.
 *
 * "Not to store" here means asking, never dropping: a silent discard would make
 * the library lie about what it produced, which is the same failure as a silent
 * cap. This module only produces the evidence — how alike two answers are, and
 * which existing one a new one repeats. The decision is a person's.
 *
 * The measure is Jaccard overlap over word BIGRAMS. Unigrams are useless here:
 * two answers to the same question necessarily share most of their vocabulary,
 * so word overlap is high whether or not they say the same thing. Bigrams carry
 * phrasing, which is what a paraphrase preserves and a genuinely different
 * answer does not.
 */

/**
 * Above this, two exemplars are saying the same thing in different words.
 *
 * Set from measurement rather than from feel — `npm run measure:similarity`
 * reports the distribution over whatever course JSON it is given. Across the
 * 823 exemplars shipped in `public/courseData` (Biology, Software Engineering,
 * Enterprise Computing):
 *
 *   same mark, same question     19 pairs, worst 0.20
 *   different marks, same q.    600 pairs, worst 0.25   ← the ladder, must not fire
 *   different questions       79,800 pairs, p99 0.03
 *
 * So no genuinely different pair in a real curated library comes within 0.10 of
 * this number, which is the margin that matters: a check that cries wolf is one
 * a teacher learns to dismiss. It was 0.5, chosen from two sentences written by
 * hand; the measurement says that left a large band — everything from 0.35 to
 * 0.5 — where a paraphrase would have slipped through for no benefit.
 *
 * What the corpus cannot say is where the TRUE positives sit: it holds curated
 * exemplars, not the generated batches this check exists for, and contains no
 * near-duplicate to measure. Re-run the script against an export once real
 * batches exist, and expect to move this again.
 */
export const NEAR_DUPLICATE_THRESHOLD = 0.35;

/** Above this, one is essentially a copy of the other. */
export const NEAR_IDENTICAL_THRESHOLD = 0.75;

/**
 * Comparable words: tags stripped (exemplars are rich text), lowercased, and
 * reduced to word characters so "Band-6" and "band 6" are not two things.
 */
export const comparableWords = (text: string): string[] =>
  (text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .toLowerCase()
    .match(/[a-z0-9']+/g)
    ?.filter(Boolean) ?? [];

const bigrams = (words: string[]): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) set.add(`${words[i]} ${words[i + 1]}`);
  return set;
};

/**
 * How alike two answers are, 0–1.
 *
 * Answers too short to form a phrase (a one-word 0-mark exemplar, say) fall
 * back to word overlap — a bigram set of size zero would otherwise report every
 * short answer as unlike every other.
 */
export const answerSimilarity = (a: string, b: string): number => {
  const wordsA = comparableWords(a);
  const wordsB = comparableWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  const setA = wordsA.length > 1 && wordsB.length > 1 ? bigrams(wordsA) : new Set(wordsA);
  const setB = wordsA.length > 1 && wordsB.length > 1 ? bigrams(wordsB) : new Set(wordsB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const gram of setA) if (setB.has(gram)) shared++;
  return shared / (setA.size + setB.size - shared);
};

export interface DuplicateMatch<T> {
  /** The existing item the candidate most resembles. */
  against: T;
  /** Jaccard overlap, 0–1. */
  score: number;
}

/**
 * The existing exemplar a candidate most resembles, if any crosses the
 * threshold. Returns the CLOSEST match rather than the first, so the panel that
 * reports it can show the strongest evidence.
 */
export const findNearDuplicate = <T extends { answer: string }>(
  candidate: string,
  existing: T[],
  threshold: number = NEAR_DUPLICATE_THRESHOLD
): DuplicateMatch<T> | null => {
  let best: DuplicateMatch<T> | null = null;
  for (const item of existing) {
    const score = answerSimilarity(candidate, item.answer);
    if (score >= threshold && (!best || score > best.score)) best = { against: item, score };
  }
  return best;
};

/** How a score reads to a person — the chip on the review row. */
export const describeSimilarity = (score: number): string =>
  score >= NEAR_IDENTICAL_THRESHOLD ? 'Near-identical' : 'Very similar';
