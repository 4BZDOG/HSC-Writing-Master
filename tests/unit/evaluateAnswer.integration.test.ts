import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { evaluateAnswer } from '../../services/geminiService';
import type { Prompt, PromptVerb } from '../../types';

/**
 * Service-level integration test for the evaluation flow. It drives the REAL
 * evaluateAnswer code path — request build → /api/gemini proxy fetch →
 * safeJsonParse → schema validation → bounds clamping — with only `fetch`
 * mocked. (A full browser E2E is intentionally separate; this exercises the
 * integration that actually produces an EvaluationResult.)
 *
 * The mock returns the shape the Step-1 proxy produces: a flattened top-level
 * `text` field plus a STOP candidate.
 */
const makeProxyResponse = (evaluationJson: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: JSON.stringify(evaluationJson),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 100 },
    }),
  }) as unknown as Response;

const basePrompt: Prompt = {
  id: 'p1',
  question: 'Describe the key steps involved in DNA replication.',
  totalMarks: 10,
  verb: 'Describe' as PromptVerb,
  scenario: '',
  markingCriteria: 'Award marks for correct sequence and terminology.',
  keywords: ['helicase', 'polymerase'],
  linkedOutcomes: [],
  sampleAnswers: [],
  isPastHSC: false,
};

describe('evaluateAnswer (service integration, mocked proxy)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a structured EvaluationResult from a valid response', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        overallMark: 7,
        overallBand: 5,
        overallFeedback: 'Strong response with clear terminology.',
        quickTip: 'Add a case study to reach the top band.',
        strengths: ['Clear terminology'],
        improvements: ['Add more depth'],
        criteria: [{ criterion: 'Accuracy', mark: 4, maxMark: 5, feedback: 'Good' }],
      })
    );

    const result = await evaluateAnswer('My answer about DNA replication.', basePrompt);

    // The client posts to the Step-1 proxy, not the SDK.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/gemini',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.overallMark).toBe(7);
    // The band is derived from mark + cognitive tier, not taken from the model.
    // 'Describe' resolves to Tier 2 (max Band 4); 7/10 maps to Band 3.
    expect(result.overallBand).toBe(3);
    expect(result.overallFeedback).toBe('Strong response with clear terminology.');
    expect(result.strengths).toContain('Clear terminology');
    expect(result.improvements).toContain('Add more depth');
    expect(result.criteria[0]).toMatchObject({ criterion: 'Accuracy', mark: 4, maxMark: 5 });
  });

  it('clamps out-of-range marks and derives the band from the tier ceiling', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        overallMark: 99, // beyond totalMarks (10)
        overallBand: 9, // model over-reaches; ignored in favour of derivation
        overallFeedback: 'x',
        quickTip: 't',
        strengths: [],
        improvements: [],
        criteria: [{ criterion: 'A', mark: 12, maxMark: 5, feedback: 'f' }],
      })
    );

    const result = await evaluateAnswer('answer', basePrompt);

    expect(result.overallMark).toBe(10); // clamped to totalMarks
    // 10/10 on a Tier-2 'Describe' question caps at Band 4 (NESA ceiling).
    expect(result.overallBand).toBe(4);
    expect(result.criteria[0].mark).toBe(5); // clamped to maxMark
  });

  it('reconciles the overall mark to the criteria sum when criteria partition the total', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        overallMark: 4, // model's holistic number disagrees with its own breakdown
        overallBand: 3,
        overallFeedback: 'ok',
        quickTip: 't',
        strengths: [],
        improvements: [],
        // maxMarks sum to totalMarks (10) -> additive criteria; marks sum to 7.
        criteria: [
          { criterion: 'Accuracy', mark: 4, maxMark: 5, feedback: 'f' },
          { criterion: 'Depth', mark: 3, maxMark: 5, feedback: 'f' },
        ],
      })
    );

    const result = await evaluateAnswer('answer', basePrompt);

    expect(result.overallMark).toBe(7); // corrected to the sum of criterion marks
  });

  it('leaves the overall mark untouched when criteria do not partition the total', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        overallMark: 6,
        overallBand: 4,
        overallFeedback: 'ok',
        quickTip: 't',
        strengths: [],
        improvements: [],
        // A single illustrative row whose maxMark (5) != totalMarks (10).
        criteria: [{ criterion: 'Accuracy', mark: 4, maxMark: 5, feedback: 'f' }],
      })
    );

    const result = await evaluateAnswer('answer', basePrompt);

    expect(result.overallMark).toBe(6); // model's mark preserved (not additive)
  });

  it('marks with a pinned low temperature and grounds the prompt in tier/length', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({
        overallMark: 5,
        overallBand: 4,
        overallFeedback: 'ok',
        quickTip: 't',
        strengths: [],
        improvements: [],
        criteria: [],
      })
    );

    await evaluateAnswer('answer', basePrompt);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    // Consistency: marking is pinned to a low temperature so the same answer
    // doesn't swing between marks across runs.
    expect(body.config.temperature).toBeLessThanOrEqual(0.3);
    // The prompt is grounded in the tier ceiling and the expected full-mark length.
    const promptText = body.contents.parts[0].text as string;
    expect(promptText).toMatch(/Maximum Achievable Band/);
    expect(promptText).toMatch(/Expected Response for Full Marks/);
  });

  it('throws a clear error when the response is structurally invalid', async () => {
    fetchMock.mockResolvedValue(
      makeProxyResponse({ overallBand: 5, overallFeedback: 'missing overallMark' })
    );

    await expect(evaluateAnswer('answer', basePrompt)).rejects.toThrow(/evaluation/);
  });

  it('throws when the proxy returns non-JSON prose', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        text: 'Sorry, I cannot help with that.',
        candidates: [{ finishReason: 'STOP' }],
      }),
    } as unknown as Response);

    await expect(evaluateAnswer('answer', basePrompt)).rejects.toThrow();
  });
});
