import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import type { Prompt, PromptVerb } from '../../types';

/**
 * Stale-result guard: an evaluation that resolves AFTER the user has moved to
 * a different question must not open the feedback modal (setEvaluationResult)
 * for the wrong question. The library auto-save still happens — the result
 * belongs to the evaluated prompt regardless of what's on screen now.
 */

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geminiService')>();
  return {
    ...actual,
    evaluateAnswer: vi.fn(),
  };
});

vi.mock('../../services/responseService', () => ({
  persistResponse: vi.fn().mockResolvedValue(undefined),
  saveResponseFeedback: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/aiCache', () => ({
  AICache: {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    // The hook builds its key through the generator, so the mock has to carry
    // it too — a bare {set,get} stub throws inside evaluate()'s try block and
    // silently turns a successful marking run into an evaluation error.
    generateEvaluationKey: vi.fn(
      (promptId: string, answer: string) => `evaluate:${promptId}:${answer}`
    ),
  },
}));

import { useGemini } from '../../hooks/useGemini';
import * as gemini from '../../services/geminiService';

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

describe('useGemini stale evaluation results', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces the result when the user is still on the evaluated question', async () => {
    const promptA = makePrompt('prompt-a');
    vi.mocked(gemini.evaluateAnswer).mockResolvedValue(evaluation as never);

    const { result } = renderHook((props) => useGemini(props), {
      initialProps: baseProps(promptA),
    });

    await act(async () => {
      await result.current.evaluate('my answer', promptA);
    });

    expect(result.current.evaluationResult).toEqual(expect.objectContaining({ overallMark: 3 }));
  });

  it('suppresses a late result after switching questions, but still saves it', async () => {
    const promptA = makePrompt('prompt-a');
    const promptB = makePrompt('prompt-b');

    let resolveEval: (v: unknown) => void = () => {};
    vi.mocked(gemini.evaluateAnswer).mockReturnValue(
      new Promise((resolve) => {
        resolveEval = resolve;
      }) as never
    );

    const props = baseProps(promptA);
    const { result, rerender } = renderHook((p) => useGemini(p), { initialProps: props });

    let evalPromise: Promise<void> = Promise.resolve();
    act(() => {
      evalPromise = result.current.evaluate('my answer', promptA);
    });

    // Student navigates to a different question while marking is in flight.
    rerender({ ...props, currentPrompt: promptB });

    await act(async () => {
      resolveEval(evaluation);
      await evalPromise;
    });

    // No modal for the wrong question…
    expect(result.current.evaluationResult).toBeNull();
    // …but the attempt was still auto-saved to the evaluated prompt's library.
    expect(props.updateCourses).toHaveBeenCalled();
  });
});
