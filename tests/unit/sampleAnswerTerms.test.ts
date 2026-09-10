import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSampleAnswer, reviseSampleAnswer } from '../../services/geminiService';
import type { Prompt, SampleAnswer } from '../../types';

/**
 * What an exemplar is written ON.
 *
 * The scope brief told the model how MANY syllabus terms to use and never which
 * — so a model answer was written from the question's wording alone while the
 * Syllabus Terms panel beside it listed nine terms that answer never touched. A
 * student reading both was being told two different things.
 *
 * These drive the real request builder (only `fetch` mocked) and assert the
 * brief that goes to the model: the terms the question and its syllabus name
 * themselves lead, and the mark decides how many of them the answer may use.
 */
const makeProxyResponse = (json: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: JSON.stringify(json),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 50 },
    }),
  }) as unknown as Response;

const bodyOf = (mock: ReturnType<typeof vi.fn>) =>
  JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

const sentText = (mock: ReturnType<typeof vi.fn>): string => JSON.stringify(bodyOf(mock));

/** The brief's must-use line, if it has one. */
const mustUseLine = (sent: string): string => {
  const match = sent.match(/MUST-USE[^"\\]*/);
  return match ? match[0] : '';
};

const prompt: Prompt = {
  id: 'p1',
  question:
    'Assess the effectiveness of automated unit testing compared to manual ad-hoc testing for code reliability.',
  totalMarks: 6,
  verb: 'ASSESS',
  scenario: 'A team is finalising a library management system.',
  markingCriteria: '6 marks: Makes a judgement.',
  keywords: ['automated unit testing', 'manual ad-hoc testing', 'regression testing', 'test data'],
  sampleAnswers: [],
} as unknown as Prompt;

describe('sample answers are written on the question’s must-use terms', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(makeProxyResponse({ answer: 'An answer.', feedback: 'Sound.' }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('names the terms, split by whether the question itself names them', async () => {
    await generateSampleAnswer(prompt, 6, []);
    const sent = sentText(fetchMock);
    const mustUse = mustUseLine(sent);

    expect(mustUse).toContain('automated unit testing');
    expect(mustUse).toContain('manual ad-hoc testing');
    // Nothing in the question or its syllabus names these two.
    expect(mustUse).not.toContain('regression testing');
    expect(sent).toContain('Supporting');
    expect(sent).toContain('regression testing');
  });

  it('demands every must-use term of a full-mark exemplar', async () => {
    await generateSampleAnswer(prompt, 6, []);
    expect(sentText(fetchMock)).toContain('uses EVERY one of these');
  });

  it('lets a lower-mark answer leave some out, and says that is the point', async () => {
    await generateSampleAnswer(prompt, 3, []);
    const sent = sentText(fetchMock);

    expect(sent).not.toContain('uses EVERY one of these');
    expect(sent).toContain('from this list first');
    expect(sent).toContain('earns 3 and not 6');
  });

  it('counts a term the syllabus names even when the question does not', async () => {
    await generateSampleAnswer(prompt, 6, [], {
      dotPoint: 'apply testing methodologies including regression testing and test data',
    });
    const mustUse = mustUseLine(sentText(fetchMock));

    expect(mustUse).toContain('regression testing');
    expect(mustUse).toContain('automated unit testing');
  });

  it('gives a revision the same brief', async () => {
    const sample = {
      id: 'sa1',
      answer: 'An earlier answer.',
      mark: 6,
      band: 6,
      source: 'AI',
      feedback: 'Strong.',
    } as SampleAnswer;

    await reviseSampleAnswer(prompt, sample, 6);
    expect(mustUseLine(sentText(fetchMock))).toContain('automated unit testing');
  });

  it('falls back to the count when the question has no terms listed', async () => {
    await generateSampleAnswer({ ...prompt, keywords: [] } as Prompt, 6, []);
    const sent = sentText(fetchMock);

    expect(sent).toMatch(/Syllabus terms: about \d+/);
    expect(sent).not.toContain('MUST-USE');
  });
});
