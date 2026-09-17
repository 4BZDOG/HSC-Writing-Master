import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateAnswer, improveAnswer } from '../../services/geminiService';
import { getBandForMark, getNextLevelTarget } from '../../data/commandTerms';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * An "improved response" is an EDIT of the student's answer worth the NEXT
 * BAND — not a model answer written from scratch. These tests drive the real
 * request builders (fetch mocked) and assert the brief sent to the model
 * carries both halves of that: a length ceiling anchored to what the student
 * actually wrote, and the instruction to keep their voice and structure.
 *
 * The two are independent on purpose, and that is what lets the target be a
 * band rather than a mark. A band jump was tried and reverted once because the
 * rewrites ran several times longer than the student's own work; the ceiling
 * now clamps to the student's own length whatever the target, so raising the
 * target no longer raises the scope.
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
  // The band the Verb Gate derives for 4/8 on a Tier 4 verb. It read 3 here,
  // which no code path can produce: `evaluateAnswer` overwrites whatever the
  // model reports with `getBandForMark`, precisely so a stored band cannot
  // drift from the mark beside it.
  overallBand: 2,
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

  it('aims a band above the student, and reports that target back', async () => {
    const result = await improveAnswer('A short attempt at caching.', prompt, evaluation);

    // 4/8 on a Tier 4 verb is Band 2; the next band starts at 5/8. The point of
    // the assertion is the BAND moving, not the arithmetic: a rewrite the
    // student is told is an improvement must not come back in the band they
    // were already in.
    const target = getNextLevelTarget(4, 8, 4);
    expect(target.targetBand).toBeGreaterThan(getBandForMark(4, 8, 4));
    expect(result.mark).toBe(target.targetMark);
    expect(result.band).toBe(target.targetBand);

    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain(`${target.targetMark}/8`);
    expect(sent).toContain('the next band up, and no further');
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

  it('asks the marker for a next-band lift of the student’s answer', async () => {
    await evaluateAnswer('A short attempt at caching.', prompt);

    const sent = JSON.stringify(bodyOf(fetchMock));
    expect(sent).toContain('Lift the STUDENT');
    expect(sent).toContain('NEXT BAND');
    expect(sent).toContain("Start from the student's own text");
    expect(sent).toContain('Hard length ceiling');
  });

  /**
   * The marker awards the mark, so it cannot be handed a precomputed target —
   * it gets the ladder and works the band out. The ladder has to stop at the
   * question's own ceiling: naming a band the Verb Gate can never award is an
   * invitation to aim at one.
   */
  it('sends the band ladder, and stops it at the question’s ceiling', async () => {
    await evaluateAnswer('A short attempt at caching.', prompt);

    const sent = JSON.stringify(bodyOf(fetchMock));
    // Analyse is Tier 4, so an 8-mark question tops out at Band 4.
    expect(sent).toContain('Band 1 starts at');
    expect(sent).toContain('Band 4 starts at');
    expect(sent).not.toContain('Band 5 starts at');
    expect(sent).not.toContain('Band 6 starts at');
  });
});
