import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateAnswer, improveAnswer } from '../../services/geminiService';
import type { EvaluationResult, Prompt, PromptVerb } from '../../types';

/**
 * "Return only the improved answer text" is an instruction, not a guarantee.
 * A rewrite that arrives fenced, or opened with "Here is the improved answer:",
 * lands verbatim in the student's draft when they press "use this version" —
 * and every word of the wrapper reads as an addition in the diff, drowning the
 * change that actually earned the mark. An empty one is a failed call, not a
 * result: returning it saved a blank exemplar into the question's library.
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

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching on system performance.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  markingCriteria: '8 marks: ...',
  keywords: [],
  sampleAnswers: [],
} as unknown as Prompt;

const evaluation: EvaluationResult = {
  overallMark: 4,
  overallBand: 3,
  overallFeedback: 'Sound.',
  strengths: [],
  improvements: [],
  criteria: [],
};

const ANSWER = 'Caching keeps data in memory.';

describe('improveAnswer cleans what the model actually returns', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('strips a code fence wrapped around the whole answer', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse('```\nCaching keeps data in memory.\n```'));

    const result = await improveAnswer(ANSWER, prompt, evaluation);

    expect(result.text).toBe('Caching keeps data in memory.');
  });

  it('strips a leading announcement line', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse('Here is the improved answer:\n\nCaching keeps data in memory.')
    );

    const result = await improveAnswer(ANSWER, prompt, evaluation);

    expect(result.text).toBe('Caching keeps data in memory.');
  });

  it('strips a restated mark heading', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse('**5/8**\nCaching keeps data in memory.'));

    const result = await improveAnswer(ANSWER, prompt, evaluation);

    expect(result.text).toBe('Caching keeps data in memory.');
  });

  it('leaves the answer’s own prose alone, including a colon inside it', async () => {
    const prose =
      'Caching works in two ways: it reduces latency, and it raises throughput under load.';
    fetchMock.mockResolvedValue(makeProxyResponse(prose));

    const result = await improveAnswer(ANSWER, prompt, evaluation);

    expect(result.text).toBe(prose);
  });

  it('treats an empty rewrite as a failure rather than a result', async () => {
    fetchMock.mockResolvedValue(makeProxyResponse('   \n  '));

    // Nothing is returned to be saved as a blank exemplar or reviewed as an
    // empty diff — the caller surfaces the error like any other AI failure.
    await expect(improveAnswer(ANSWER, prompt, evaluation)).rejects.toThrow(/came back empty/i);
  });
});

describe('the marking rewrite is cleaned the same way', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const evaluationReply = (revisedAnswer: unknown) => ({
    overallMark: 4,
    overallBand: 3,
    overallFeedback: 'Sound.',
    quickTip: 'Link cause and effect.',
    strengths: [],
    improvements: [],
    criteria: [],
    revisedAnswer,
  });

  it('strips an announcement from the string form', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse(evaluationReply('Improved response:\nCaching keeps data in memory.'))
    );

    const result = await evaluateAnswer(ANSWER, prompt);

    expect(result.revisedAnswer).toBe('Caching keeps data in memory.');
  });

  it('strips a fence from the structured form', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse(
        evaluationReply({ text: '```\nCaching keeps data in memory.\n```', mark: 5, keyChanges: [] })
      )
    );

    const result = await evaluateAnswer(ANSWER, prompt);

    expect(typeof result.revisedAnswer === 'object' && result.revisedAnswer.text).toBe(
      'Caching keeps data in memory.'
    );
  });

  it('leaves a withheld (redacted) rewrite empty rather than inventing one', async () => {
    // The proxy blanks this for a plan without answer upgrades.
    fetchMock.mockResolvedValue(makeProxyResponse(evaluationReply('')));

    const result = await evaluateAnswer(ANSWER, prompt);

    expect(result.revisedAnswer).toBe('');
  });
});
