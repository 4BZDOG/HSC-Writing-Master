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
