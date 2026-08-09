import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * Marking opens the comparison, not the feedback summary.
 *
 * `evaluateAnswer` is briefed to return the student's own answer lifted one
 * mark, and the diff between the two is the most teachable thing in the result:
 * it names the handful of words that earned the extra mark. Behind a "Compare
 * with mine" button on the summary, most students never pressed it — so the
 * comparison now comes first and the summary waits behind it.
 *
 * The flag has to be earned, though. A free-tier result carries a rewrite the
 * proxy has emptied (`redactPaidFeedback`), and raising the review for one
 * would put a blank overlay between a student and their mark.
 */

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geminiService')>();
  return { ...actual, evaluateAnswer: vi.fn(), improveAnswer: vi.fn() };
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

vi.mock('../../services/authService', () => ({
  authService: {
    getCurrentUser: () => ({ username: 'student-a', role: 'student', preferences: {} }),
  },
}));

import { useGemini } from '../../hooks/useGemini';
import * as gemini from '../../services/geminiService';

const prompt = {
  id: 'p1',
  question: 'Describe X.',
  totalMarks: 4,
  verb: 'DESCRIBE' as PromptVerb,
  sampleAnswers: [] as SampleAnswer[],
  keywords: ['k'],
  scenario: 's',
  linkedOutcomes: ['O1'],
  markingCriteria: '',
  isPastHSC: false,
} as Prompt;

const evaluation = {
  overallMark: 3,
  overallBand: 2,
  overallFeedback: 'Good.',
  quickTip: 'Tip.',
  strengths: [],
  improvements: [],
  criteria: [],
};

const statePath = {
  courseId: 'c',
  topicId: 't',
  subTopicId: 's',
  dotPointId: 'd',
  promptId: prompt.id,
};

const treeAround = (target: Prompt) => [
  {
    id: 'c',
    name: 'Course',
    outcomes: [],
    topics: [
      {
        id: 't',
        name: 'Topic',
        subTopics: [
          { id: 's', name: 'Sub', dotPoints: [{ id: 'd', description: 'DP', prompts: [target] }] },
        ],
      },
    ],
  },
];

const markWith = async (revisedAnswer: unknown) => {
  const target = { ...prompt, sampleAnswers: [] as SampleAnswer[] };
  const draft = treeAround(target);
  vi.mocked(gemini.evaluateAnswer).mockResolvedValue({
    ...evaluation,
    ...(revisedAnswer === undefined ? {} : { revisedAnswer }),
  } as never);

  const { result } = renderHook(() =>
    useGemini({
      showToast: vi.fn(),
      updateCourses: vi.fn((recipe: (d: unknown) => void) => recipe(draft)),
      statePath,
      currentPrompt: prompt,
      currentCourse: null,
      onApiKeyInvalid: vi.fn(),
    } as never)
  );

  await act(async () => {
    await result.current.evaluate('my answer', prompt);
  });

  return result;
};

describe('marking opens the comparison before the feedback summary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('raises the comparison when marking produced a rewrite', async () => {
    const result = await markWith('A fuller response naming the syllabus term.');

    expect(result.current.showImprovementReview).toBe(true);
    expect(result.current.improvementReviewLeadsToFeedback).toBe(true);
    // The marks are ready underneath the whole time — the comparison is a
    // curtain, not a substitute.
    expect(result.current.evaluationResult?.overallMark).toBe(3);
  });

  it('raises it for the structured rewrite form as well', async () => {
    const result = await markWith({
      text: 'A fuller response.',
      keyChanges: ['Named the term'],
      mark: 4,
      band: 3,
    });

    expect(result.current.showImprovementReview).toBe(true);
  });

  it('goes straight to the feedback when the rewrite was withheld', async () => {
    const result = await markWith({ text: '', keyChanges: [], mark: 4, band: 3 });

    expect(result.current.showImprovementReview).toBe(false);
    expect(result.current.improvementReviewLeadsToFeedback).toBe(false);
    expect(result.current.evaluationResult).toBeTruthy();
  });

  it('goes straight to the feedback when there is no rewrite at all', async () => {
    const result = await markWith(undefined);

    expect(result.current.showImprovementReview).toBe(false);
    expect(result.current.evaluationResult).toBeTruthy();
  });

  it('clears the flag once the student closes the comparison', async () => {
    const result = await markWith('A fuller response.');

    act(() => result.current.setShowImprovementReview(false));

    expect(result.current.showImprovementReview).toBe(false);
    // Closing reveals the feedback; it must never cost the mark.
    expect(result.current.evaluationResult?.overallMark).toBe(3);
  });

  it('does not claim to lead anywhere when the review is a detour off the summary', async () => {
    // "Improve my answer" is pressed FROM the feedback summary, so its review
    // returns there rather than introducing it.
    const result = await markWith('A fuller response.');
    vi.mocked(gemini.improveAnswer).mockResolvedValue({
      text: 'An even fuller response.',
      mark: 4,
      band: 3,
    } as never);

    await act(async () => {
      await result.current.improveAnswer('my answer', prompt, evaluation as never);
    });

    expect(result.current.showImprovementReview).toBe(true);
    expect(result.current.improvementReviewLeadsToFeedback).toBe(false);
  });
});
