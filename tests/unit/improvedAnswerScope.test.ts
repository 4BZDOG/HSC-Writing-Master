import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateAnswer, improveAnswer } from '../../services/geminiService';
import { getNextLevelTarget } from '../../data/commandTerms';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * An "improved response" is an EDIT of the student's answer worth one more
 * mark — not a model answer written from scratch. These tests drive the real
 * request builders (fetch mocked) and assert the brief sent to the model
 * carries both halves of that: a length ceiling anchored to what the student
 * actually wrote, and the instruction to keep their voice and structure.
 */
const makeProxyResponse = (payload: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: typeof payload === 'string' ? payload : JSON.stringify(payload),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 60 },
    }),
  }) as unknown as Response;

const bodyOf = (mock: ReturnType<typeof vi.fn>) =>
  JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching on system performance.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  scenario: 'A retailer is scaling its checkout service.',
  markingCriteria: '8 marks: ...',
  keywords: ['cache hit ratio'],
  linkedOutcomes: [],
  sampleAnswers: [],
  isPastHSC: false,
};

const evaluation: EvaluationResult = {
  overallMark: 4,
  overallBand: 3,
  overallFeedback: 'Sound but under-developed.',
  quickTip: 'Link cause and effect explicitly.',
  strengths: ['Defines caching'],
  improvements: ['Explain the effect on latency', 'Use the term cache hit ratio'],
  criteria: [],
};

// "Hard length ceiling: 640 characters (about 107 words)."
const ceilingOf = (sent: string): number => {
  const match = sent.match(/Hard length ceiling: (\d+) characters/);
  expect(match).not.toBeNull();
  return Number(match![1]);
};

describe('improveAnswer targets the next marking level, not a new essay', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(makeProxyResponse('An improved answer.'));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('aims one mark above the student, and reports that target back', async () => {
    const result = await improveAnswer('A short attempt at caching.', prompt, evaluation);

    expect(result.mark).toBe(5);
    expect(result.band).toBe(getNextLevelTarget(4, 8, 4).targetBand);

    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('5/8');
    expect(sent).toContain('one mark higher, nothing more');
  });

  it('briefs the model to edit the student’s own text rather than replace it', async () => {
    await improveAnswer('A short attempt at caching.', prompt, evaluation);

    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain("Start from the student's own text");
    expect(sent).toContain('not a model answer written from scratch');
    expect(sent).toContain('Do NOT rewrite from scratch');
    // The marker's own list of gaps is the brief for the edit.
    expect(sent).toContain('Explain the effect on latency');
    expect(sent).toContain('Link cause and effect explicitly');
  });

  it('scales the length ceiling to what the student wrote', async () => {
    await improveAnswer('Caching stores data.', prompt, evaluation);
    const shortCeiling = ceilingOf(JSON.stringify(bodyOf(fetchMock)));

    fetchMock.mockClear();
    await improveAnswer('Caching stores data. '.repeat(20), prompt, evaluation);
    const longCeiling = ceilingOf(JSON.stringify(bodyOf(fetchMock)));

    expect(shortCeiling).toBeLessThan(longCeiling);
    // A three-word answer must not licence a full-page rewrite.
    expect(shortCeiling).toBeLessThan(260);
  });

  it('never lets the ceiling exceed the scope of the target mark', async () => {
    // A student who padded to 4/8 gets a SHORTER rewrite, not a longer one.
    await improveAnswer('word '.repeat(600), prompt, evaluation);
    const ceiling = ceilingOf(JSON.stringify(bodyOf(fetchMock)));

    expect(ceiling).toBeLessThan(3000);
  });
});

describe('the rewrite returned with a mark is scoped the same way', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(
      makeProxyResponse({
        overallMark: 4,
        overallBand: 3,
        overallFeedback: 'Sound.',
        quickTip: 'Link cause and effect.',
        strengths: [],
        improvements: [],
        criteria: [],
        revisedAnswer: 'Better.',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks the marker for a one-mark lift of the student’s answer', async () => {
    await evaluateAnswer('A short attempt at caching.', prompt);

    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('Lift the STUDENT');
    expect(sent).toContain('exactly ONE mark');
    expect(sent).toContain("Start from the student's own text");
    expect(sent).toContain('Hard length ceiling');
  });
});
