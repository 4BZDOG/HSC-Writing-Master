import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prompt, PromptVerb } from '../../types';

/**
 * A generated marking guide is the rubric every later answer to its question is
 * marked against, and the brief asks for an exact ladder. What came back used to
 * be saved unread — including, in a bulk run from the Content Audit Studio, into
 * dozens of questions at once.
 */

vi.mock('../../services/aiCore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/aiCore')>();
  return { ...actual, generateContentWithRetry: vi.fn() };
});

import { expectedGuideRows, guideLadderProblem, guideRows } from '../../utils/markingGuideLadder';
import { generateRubricForPrompt, reviseRubricForPrompt } from '../../services/geminiService';
import { generateContentWithRetry } from '../../services/aiCore';

const reply = (text: string) => ({ text }) as Awaited<ReturnType<typeof generateContentWithRetry>>;

const prompt = (totalMarks: number, verb = 'DESCRIBE'): Prompt =>
  ({
    id: 'p',
    question: 'Describe the key steps involved in DNA replication.',
    verb: verb as PromptVerb,
    totalMarks,
    keywords: [],
    sampleAnswers: [],
  }) as unknown as Prompt;

const GOOD_4 = `4 marks: Describes every step in sequence
3 marks: Describes most steps
2 marks: Outlines some steps
1 mark: Identifies a feature`;

beforeEach(() => vi.clearAllMocks());

describe('the ladder a guide must have', () => {
  it('is one row per mark on a short question, full marks first', () => {
    expect(expectedGuideRows(4, 2)).toEqual([
      { lo: 4, hi: 4 },
      { lo: 3, hi: 3 },
      { lo: 2, hi: 2 },
      { lo: 1, hi: 1 },
    ]);
  });

  it('reads rows with ranges, bullets and bold', () => {
    expect(guideRows('- **7-8 marks**: x\n5-6 marks: y\n• 1 mark: z')).toEqual([
      { lo: 7, hi: 8 },
      { lo: 5, hi: 6 },
      { lo: 1, hi: 1 },
    ]);
  });

  it('accepts the ladder it asked for', () => {
    expect(guideLadderProblem(GOOD_4, 4, 2)).toBeNull();
  });

  it('names what is wrong with one that starts low, skips or climbs', () => {
    expect(guideLadderProblem('3 marks: a\n2 marks: b\n1 mark: c', 4, 2)).toMatch(
      /has rows for 3, 2, 1 marks; it needs 4, 3, 2, 1 marks/
    );
    expect(
      guideLadderProblem('1 mark: a\n2 marks: b\n3 marks: c\n4 marks: d', 4, 2)
    ).not.toBeNull();
  });
});

describe('generating a marking guide', () => {
  it('keeps a guide that follows the ladder, in one call', async () => {
    vi.mocked(generateContentWithRetry).mockResolvedValueOnce(reply(GOOD_4));
    await expect(generateRubricForPrompt(prompt(4), [])).resolves.toMatch(/^4 marks:/);
    expect(generateContentWithRetry).toHaveBeenCalledTimes(1);
  });

  it('asks again, naming the problem, when the first guide misses the ladder', async () => {
    vi.mocked(generateContentWithRetry)
      .mockResolvedValueOnce(reply('3 marks: a\n2 marks: b\n1 mark: c'))
      .mockResolvedValueOnce(reply(GOOD_4));
    await expect(generateRubricForPrompt(prompt(4), [])).resolves.toMatch(/^4 marks:/);
    const retry = vi.mocked(generateContentWithRetry).mock.calls[1][0] as {
      contents: { parts: { text: string }[] };
    };
    expect(retry.contents.parts[0].text).toMatch(/PREVIOUS MARKING GUIDE WAS REJECTED/);
  });

  it('refuses a guide that misses twice rather than saving it', async () => {
    vi.mocked(generateContentWithRetry).mockResolvedValue(reply('2 marks: a\n1 mark: b'));
    await expect(generateRubricForPrompt(prompt(4), [])).rejects.toThrow(
      /did not follow the 4-mark ladder.*Nothing was saved/
    );
  });

  it('holds a revised guide to the same ladder', async () => {
    vi.mocked(generateContentWithRetry).mockResolvedValue(reply('4 marks: a\n1 mark: b'));
    await expect(reviseRubricForPrompt(prompt(4), '1 mark: x\n4 marks: y')).rejects.toThrow(
      /Nothing was saved/
    );
  });
});
