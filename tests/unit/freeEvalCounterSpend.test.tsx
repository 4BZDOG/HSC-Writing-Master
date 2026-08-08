import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook, act } from '@testing-library/react';
import type { Prompt, PromptVerb, UserFeedback } from '../../types';

/**
 * The local free-evaluation mirror must be spent ONCE PER MARKING CALL, and
 * only for a marking call.
 *
 * It used to be an effect in App keyed on the `evaluationResult` object:
 *
 *   useEffect(() => { if (evaluationResult) recordEvaluation(); }, [evaluationResult]);
 *
 * `handleFeedbackSubmit` replaces that object (it spreads a `userFeedback`
 * onto a copy), so rating your own feedback re-fired the effect and charged a
 * second evaluation the server never metered. On a 5-a-day allowance, a
 * student who rated every mark saw their remaining count fall twice as fast as
 * the count the proxy was actually enforcing — and hit an upgrade prompt with
 * evaluations still owed to them.
 *
 * The spend now happens inside `evaluate()`, at the point the proxy call
 * returned.
 */

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geminiService')>();
  return { ...actual, evaluateAnswer: vi.fn() };
});

vi.mock('../../services/responseService', () => ({
  persistResponse: vi.fn().mockResolvedValue(undefined),
  saveResponseFeedback: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/aiCache', () => ({
  AICache: {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    generateEvaluationKey: vi.fn((promptId: string, answer: string) => `${promptId}:${answer}`),
  },
}));

// A signed-in free student, so the counter is keyed and actually consulted.
vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => ({ username: 'student-a', role: 'student', preferences: {} }),
  },
}));

import { useGemini } from '../../hooks/useGemini';
import * as gemini from '../../services/geminiService';
import { freeEvalsRemaining, FREE_TIER_EVAL_LIMIT } from '../../services/entitlements';

const makePrompt = (id: string): Prompt =>
  ({
    id,
    question: 'Describe X.',
    totalMarks: 4,
    verb: 'DESCRIBE' as PromptVerb,
    sampleAnswers: [],
    keywords: ['k'],
    scenario: 's',
    linkedOutcomes: ['O1'],
    markingCriteria: '',
    isPastHSC: false,
  }) as Prompt;

const evaluation = {
  overallMark: 3,
  overallBand: 2,
  overallFeedback: 'Good.',
  quickTip: 'Tip.',
  strengths: [],
  improvements: [],
  criteria: [],
};

const baseProps = (prompt: Prompt) => ({
  showToast: vi.fn(),
  updateCourses: vi.fn(),
  statePath: { courseId: 'c', topicId: 't', subTopicId: 's', dotPointId: 'd', promptId: prompt.id },
  currentPrompt: prompt,
  currentCourse: null,
  onApiKeyInvalid: vi.fn(),
});

describe('free-tier evaluation counter — one spend per marking call', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('spends exactly one evaluation for one marking run', async () => {
    const prompt = makePrompt('p1');
    vi.mocked(gemini.evaluateAnswer).mockResolvedValue(evaluation as never);

    const { result } = renderHook((p) => useGemini(p), { initialProps: baseProps(prompt) });

    await act(async () => {
      await result.current.evaluate('my answer', prompt);
    });

    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT - 1);
  });

  it('does not charge a second evaluation for rating the feedback', async () => {
    const prompt = makePrompt('p1');
    vi.mocked(gemini.evaluateAnswer).mockResolvedValue(evaluation as never);

    const { result } = renderHook((p) => useGemini(p), { initialProps: baseProps(prompt) });

    await act(async () => {
      await result.current.evaluate('my answer', prompt);
    });
    const afterMarking = freeEvalsRemaining();

    // Thumbs-up on the result — replaces the evaluationResult object.
    const feedback: UserFeedback = { rating: 'positive', reason: '', timestamp: Date.now() };
    act(() => {
      result.current.handleFeedbackSubmit(feedback);
    });

    expect(result.current.evaluationResult?.userFeedback).toEqual(feedback);
    expect(freeEvalsRemaining()).toBe(afterMarking);
  });

  it('spends nothing when the marking call fails', async () => {
    const prompt = makePrompt('p1');
    vi.mocked(gemini.evaluateAnswer).mockRejectedValue(new Error('provider down'));

    const { result } = renderHook((p) => useGemini(p), { initialProps: baseProps(prompt) });

    await act(async () => {
      await result.current.evaluate('my answer', prompt);
    });

    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT);
  });

  it('spends one per sample when recalibrating, mirroring what the server meters', async () => {
    const prompt = {
      ...makePrompt('p1'),
      sampleAnswers: [
        { id: 'sa1', answer: 'a', mark: 1, band: 1, source: 'USER' as const },
        { id: 'sa2', answer: 'b', mark: 2, band: 2, source: 'USER' as const },
      ],
    } as Prompt;
    vi.mocked(gemini.evaluateAnswer).mockResolvedValue(evaluation as never);

    const { result } = renderHook((p) => useGemini(p), { initialProps: baseProps(prompt) });

    await act(async () => {
      await result.current.recalibrateSamples(prompt);
    });

    expect(freeEvalsRemaining()).toBe(FREE_TIER_EVAL_LIMIT - 2);
  });
});

/**
 * The behavioural tests above pin the spend to `evaluate()`. They cannot see
 * the shape the bug actually took — an effect in App, one layer up — so this
 * reads the source and refuses the pattern outright. Rendering App to catch it
 * would mean standing up auth, IndexedDB and every modal for one assertion.
 */
describe('App does not re-spend the counter from render state', () => {
  const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');

  it('leaves the evaluation spend to the hook that makes the call', () => {
    // `evaluationResult` is replaced whenever the user rates their feedback,
    // so anything in App that spends the allowance on seeing one is a
    // double-charge waiting to happen. The counter is spent in useGemini.
    expect(app).not.toContain('recordEvaluation');
  });
});
