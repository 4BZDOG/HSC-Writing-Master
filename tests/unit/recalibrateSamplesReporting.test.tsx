import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Prompt, PromptVerb } from '../../types';

/**
 * Recalibration marks saved exemplars sequentially — one metered evaluation
 * each. A run where SOME samples succeed and SOME fail used to save the wins
 * and report only those, so a teacher never learned which exemplars still
 * carried their old (possibly wrong) mark. These tests pin the three outcomes:
 *
 *   - all succeed        → the existing success toast
 *   - all fail           → the existing error toast
 *   - some fail (partial)→ a specific warning naming the failure count
 *
 * They also confirm the onProgress callback advances once per sample, whether
 * that sample succeeded or failed.
 */

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geminiService')>();
  return { ...actual, evaluateAnswer: vi.fn() };
});

vi.mock('../../services/aiCache', () => ({
  AICache: {
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    generateEvaluationKey: vi.fn((promptId: string, answer: string) => `${promptId}:${answer}`),
  },
}));

// A signed-in free student, so the metered path is exercised as in production.
vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => ({ username: 'student-a', role: 'student', preferences: {} }),
  },
}));

import { useGemini } from '../../hooks/useGemini';
import * as gemini from '../../services/geminiService';

const evaluation = {
  overallMark: 3,
  overallBand: 2,
  overallFeedback: 'Good.',
  quickTip: 'Tip.',
  strengths: [],
  improvements: [],
  criteria: [],
};

const makePrompt = (): Prompt =>
  ({
    id: 'p1',
    question: 'Describe X.',
    totalMarks: 4,
    verb: 'DESCRIBE' as PromptVerb,
    sampleAnswers: [
      { id: 'sa1', answer: 'a', mark: 1, band: 1, source: 'USER' as const },
      { id: 'sa2', answer: 'b', mark: 2, band: 2, source: 'USER' as const },
      { id: 'sa3', answer: 'c', mark: 3, band: 3, source: 'USER' as const },
    ],
    keywords: ['k'],
    scenario: 's',
    linkedOutcomes: ['O1'],
    markingCriteria: '',
    isPastHSC: false,
  }) as Prompt;

const baseProps = (
  prompt: Prompt,
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
) => ({
  showToast,
  updateCourses: vi.fn(),
  statePath: { courseId: 'c', topicId: 't', subTopicId: 's', dotPointId: 'd', promptId: prompt.id },
  currentPrompt: prompt,
  currentCourse: null,
  onApiKeyInvalid: vi.fn(),
});

describe('recalibrateSamples — completion reporting', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('reports a partial failure with a specific, count-naming warning toast', async () => {
    const prompt = makePrompt();
    const showToast = vi.fn();
    // Middle sample (answer 'b') rejects; the other two mark cleanly.
    vi.mocked(gemini.evaluateAnswer).mockImplementation(async (answer: string) => {
      if (answer === 'b') throw new Error('provider down');
      return evaluation as never;
    });

    const { result } = renderHook((p) => useGemini(p), {
      initialProps: baseProps(prompt, showToast),
    });

    await act(async () => {
      await result.current.recalibrateSamples(prompt);
    });

    expect(showToast).toHaveBeenCalledWith(
      'Recalibrated 2 samples, 1 failed — check your connection and retry those.',
      'warning'
    );
    // The all-success and all-failed copy must NOT appear on a partial run.
    expect(showToast).not.toHaveBeenCalledWith(
      expect.stringContaining('Recalibration complete'),
      'success'
    );
    expect(showToast).not.toHaveBeenCalledWith(
      'Failed to recalibrate samples. Check API connection.',
      'error'
    );
  });

  it('keeps the all-success toast when every sample marks cleanly', async () => {
    const prompt = makePrompt();
    const showToast = vi.fn();
    vi.mocked(gemini.evaluateAnswer).mockResolvedValue(evaluation as never);

    const { result } = renderHook((p) => useGemini(p), {
      initialProps: baseProps(prompt, showToast),
    });

    await act(async () => {
      await result.current.recalibrateSamples(prompt);
    });

    expect(showToast).toHaveBeenCalledWith('Recalibration complete. Updated 3 answers.', 'success');
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('failed'), 'error');
  });

  it('keeps the all-failed error toast when every sample fails', async () => {
    const prompt = makePrompt();
    const showToast = vi.fn();
    vi.mocked(gemini.evaluateAnswer).mockRejectedValue(new Error('provider down'));

    const { result } = renderHook((p) => useGemini(p), {
      initialProps: baseProps(prompt, showToast),
    });

    await act(async () => {
      await result.current.recalibrateSamples(prompt);
    });

    expect(showToast).toHaveBeenCalledWith(
      'Failed to recalibrate samples. Check API connection.',
      'error'
    );
    // No partial ("Recalibrated N …") copy when nothing succeeded.
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('Recalibrated'), 'error');
  });

  it('advances onProgress once per sample, including the failed one', async () => {
    const prompt = makePrompt();
    const showToast = vi.fn();
    vi.mocked(gemini.evaluateAnswer).mockImplementation(async (answer: string) => {
      if (answer === 'b') throw new Error('provider down');
      return evaluation as never;
    });

    const onProgress = vi.fn();
    const { result } = renderHook((p) => useGemini(p), {
      initialProps: baseProps(prompt, showToast),
    });

    await act(async () => {
      await result.current.recalibrateSamples(prompt, undefined, onProgress);
    });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });
});
