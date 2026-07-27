import { describe, it, expect } from 'vitest';
import { analyzeText, buildWritingInsights, InsightInput } from '../../utils/writingAnalysis';

describe('analyzeText', () => {
  it('returns zeros for empty text', () => {
    const a = analyzeText('');
    expect(a).toEqual({
      wordCount: 0,
      sentenceCount: 0,
      avgWordsPerSentence: 0,
      longestSentenceWords: 0,
      paragraphCount: 0,
    });
  });

  it('counts words and sentences', () => {
    const a = analyzeText('The cell divides. Then it grows again!');
    expect(a.wordCount).toBe(7);
    expect(a.sentenceCount).toBe(2);
    expect(a.avgWordsPerSentence).toBe(4); // round(7/2)
  });

  it('treats an unpunctuated draft as one long sentence', () => {
    const text = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const a = analyzeText(text);
    expect(a.sentenceCount).toBe(1);
    expect(a.longestSentenceWords).toBe(50);
  });

  it('finds the longest sentence', () => {
    const a = analyzeText('Short. This particular sentence has quite a few more words in it.');
    expect(a.longestSentenceWords).toBe(11);
  });

  it('counts paragraphs split by blank lines', () => {
    const a = analyzeText('First para line.\n\nSecond paragraph here.');
    expect(a.paragraphCount).toBe(2);
  });
});

const baseInput = (over: Partial<InsightInput> = {}): InsightInput => ({
  analysis: analyzeText('A reasonable sentence here. And another one following it.'),
  targetWordCount: 100,
  targetLabel: 'Band 5',
  keywordsTotal: 4,
  keywordsUsed: 4,
  missingKeywords: [],
  ...over,
});

describe('buildWritingInsights', () => {
  it('returns nothing for a blank draft', () => {
    expect(buildWritingInsights(baseInput({ analysis: analyzeText('') }))).toEqual([]);
  });

  it('prompts for more words when under target length', () => {
    const insights = buildWritingInsights(baseInput());
    expect(insights.some((i) => i.id === 'length-short')).toBe(true);
  });

  it('flags missing syllabus keywords with examples', () => {
    const insights = buildWritingInsights(
      baseInput({ keywordsUsed: 2, missingKeywords: ['osmosis', 'diffusion'] })
    );
    const kw = insights.find((i) => i.id === 'keywords-missing');
    expect(kw?.message).toMatch(/osmosis/);
  });

  it('flags a run-on sentence', () => {
    const longSentence = Array.from({ length: 60 }, () => 'word').join(' ') + '.';
    const insights = buildWritingInsights(baseInput({ analysis: analyzeText(longSentence) }));
    expect(insights.some((i) => i.id === 'run-on')).toBe(true);
  });

  it('caps the number of insights at four', () => {
    const longSentence = Array.from({ length: 60 }, () => 'word').join(' ');
    const insights = buildWritingInsights(
      baseInput({
        analysis: analyzeText(longSentence), // long, unpunctuated, no paragraphs
        targetWordCount: 200,
        keywordsUsed: 0,
        missingKeywords: ['a', 'b', 'c'],
      })
    );
    expect(insights.length).toBeLessThanOrEqual(4);
  });

  // "This is quite long" used to be measured against 1.6 × the MINIMUM target,
  // so a 2-mark question (target ~16 words) told a student off at 26 words.
  describe('the overlong warning', () => {
    const draftOf = (words: number) =>
      analyzeText(Array.from({ length: words }, (_, i) => `word${i}. `).join(''));

    it('stays quiet inside the expected range', () => {
      const insights = buildWritingInsights(
        baseInput({
          analysis: draftOf(240),
          targetWordCount: 200,
          targetWordCountMax: 280,
          keywordsTotal: 0,
        })
      );
      expect(insights.some((i) => i.id === 'length-long')).toBe(false);
      expect(insights.some((i) => i.id === 'length-good')).toBe(true);
    });

    it('fires once the draft runs past the top of the range', () => {
      const insights = buildWritingInsights(
        baseInput({
          analysis: draftOf(400),
          targetWordCount: 200,
          targetWordCountMax: 280,
          keywordsTotal: 0,
        })
      );
      const long = insights.find((i) => i.id === 'length-long');
      expect(long?.message).toMatch(/400 words/);
      expect(long?.message).toMatch(/280/);
    });

    it('never calls a short answer to a low-mark question long', () => {
      const insights = buildWritingInsights(
        baseInput({
          analysis: draftOf(30),
          targetWordCount: 16,
          targetWordCountMax: 30,
          keywordsTotal: 0,
        })
      );
      expect(insights.some((i) => i.id === 'length-long')).toBe(false);
    });

    it('falls back to the old 1.6x rule when no upper bound is supplied', () => {
      const insights = buildWritingInsights(
        baseInput({ analysis: draftOf(300), targetWordCount: 100, keywordsTotal: 0 })
      );
      expect(insights.some((i) => i.id === 'length-long')).toBe(true);
    });
  });

  it('does not ask for more words and less verbosity at the same time', () => {
    const insights = buildWritingInsights(
      baseInput({
        analysis: analyzeText('Two short sentences. That is all so far.'),
        targetWordCount: 200,
        charCount: 5000,
        charRange: [400, 900],
      })
    );
    expect(insights.some((i) => i.id === 'length-short')).toBe(true);
    expect(insights.some((i) => i.id === 'chars-over')).toBe(false);
  });

  it('does not say the same thing twice when the draft is simply overlong', () => {
    const draft = analyzeText(Array.from({ length: 400 }, (_, i) => `word${i}. `).join(''));
    const insights = buildWritingInsights(
      baseInput({
        analysis: draft,
        targetWordCount: 100,
        targetWordCountMax: 140,
        keywordsTotal: 0,
        charCount: 4000,
        charRange: [400, 900],
      })
    );
    expect(insights.some((i) => i.id === 'length-long')).toBe(true);
    expect(insights.some((i) => i.id === 'chars-over')).toBe(false);
  });

  it('gives positive reinforcement when the draft is healthy', () => {
    const good = analyzeText(
      'This response is well developed. It uses clear ideas. Each sentence is concise.'
    );
    const insights = buildWritingInsights(
      baseInput({ analysis: good, targetWordCount: 12, keywordsTotal: 0 })
    );
    expect(insights.every((i) => i.tone === 'positive')).toBe(true);
    expect(insights.length).toBeGreaterThan(0);
  });
});
