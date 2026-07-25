import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSampleAnswer, reviseSampleAnswer } from '../../services/geminiService';
import { getStructureGuide } from '../../data/commandTerms';
import type { Prompt, SampleAnswer } from '../../types';

/**
 * Sample answers teach scope as much as content: a 2/4 sample written to
 * full-mark length tells students to write four times too much. These tests
 * drive the real request builders (fetch mocked) and assert the length brief
 * sent to the model tracks the TARGET mark, not the verb's full range.
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

const prompt: Prompt = {
  id: 'p1',
  question: 'Apply OOP principles to a simple neural network.',
  totalMarks: 4,
  verb: 'Apply',
  markingCriteria: '4 marks: ...',
  keywords: ['Classes'],
  sampleAnswers: [],
} as unknown as Prompt;

// Characters requested for the "answer" field, e.g. "Length: 120-400 characters".
const charCeiling = (sent: string): number => {
  const match = sent.match(/Length: (\d+)-(\d+) characters/);
  expect(match).not.toBeNull();
  return Number(match![2]);
};

describe('sample answer length scales with the target mark', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('briefs a low-mark sample with the structure guide for that mark', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse({ answer: 'Short.', feedback: 'Limited.' }));

    await generateSampleAnswer(prompt, 2, []);

    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain(getStructureGuide(2));
    expect(sent).toContain('Scope for a 2/4 answer');
    expect(sent).toContain('hard ceiling');
  });

  it('asks a 1-mark sample for far fewer characters than a full-mark one', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse({ answer: 'A.', feedback: 'Minimal.' }));
    await generateSampleAnswer(prompt, 1, []);
    const lowCeiling = charCeiling(JSON.stringify(bodyOf(fetchMock)));

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(makeProxyResponse({ answer: 'Full.', feedback: 'Excellent.' }));
    await generateSampleAnswer(prompt, 4, []);
    const fullCeiling = charCeiling(JSON.stringify(bodyOf(fetchMock)));

    expect(lowCeiling).toBeLessThan(fullCeiling / 2);
  });

  it('gives revisions the same mark-scaled scope brief', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse({ answer: 'Trimmed.', feedback: 'Sound.' }));

    const sample = {
      id: 'sa1',
      answer: 'A long original answer.',
      mark: 4,
      band: 4,
      source: 'AI',
      feedback: 'Strong.',
    } as SampleAnswer;
    await reviseSampleAnswer(prompt, sample, 2);

    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('Scope for a 2/4 answer');
    expect(sent).toContain(getStructureGuide(2));
  });
});
