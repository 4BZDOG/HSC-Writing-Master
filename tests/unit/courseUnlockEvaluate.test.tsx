import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import type { Prompt, PromptVerb } from '../../types';

/**
 * The marking path for course unlocks: the request carries `__courseId` only while
 * unlocks are on, a server `course_locked` 402 becomes CourseLockedError (and is not
 * retried or read as the evaluation meter), and useGemini hands that error to the
 * unlock prompt.
 */

// Delegates to the real evaluateAnswer unless a test sets an override (the useGemini cases).
const evaluateSpy = vi.fn();
let override = false;

vi.mock('../../services/geminiService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/geminiService')>();
  return {
    ...actual,
    evaluateAnswer: (...args: unknown[]) =>
      override
        ? evaluateSpy(...args)
        : (actual.evaluateAnswer as (...a: unknown[]) => unknown)(...args),
  };
});

import { evaluateAnswer as realEvaluateAnswer } from '../../services/geminiService';
import { CourseLockedError, EvaluationLimitError } from '../../services/aiCore';
import { useGemini } from '../../hooks/useGemini';

const basePrompt: Prompt = {
  id: 'p1',
  question: 'Describe the key steps involved in DNA replication.',
  totalMarks: 10,
  verb: 'Describe' as PromptVerb,
  scenario: '',
  markingCriteria: '',
  keywords: [],
  linkedOutcomes: [],
  sampleAnswers: [],
  isPastHSC: false,
} as Prompt;

const okEvaluation = {
  overallMark: 7,
  overallBand: 5,
  overallFeedback: 'Good.',
  quickTip: 'Tip.',
  strengths: [],
  improvements: [],
  criteria: [],
};

const proxyOk = () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      text: JSON.stringify(okEvaluation),
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { totalTokenCount: 10 },
    }),
  }) as unknown as Response;

const proxyRefusal = (status: number, body: unknown) =>
  ({
    ok: false,
    status,
    json: async () => body,
  }) as unknown as Response;

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.unstubAllEnvs();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  evaluateSpy.mockReset();
  override = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('evaluation request and __courseId', () => {
  it('sends no __courseId while unlocks are off, even when a course is given', async () => {
    fetchMock.mockResolvedValue(proxyOk());
    await realEvaluateAnswer('My answer.', basePrompt, undefined, undefined, {
      courseId: 'course-chem',
    });
    expect(sentBody(fetchMock)).not.toHaveProperty('__courseId');
  });

  it('sends __courseId alongside __feature when unlocks are on', async () => {
    vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'true');
    fetchMock.mockResolvedValue(proxyOk());
    await realEvaluateAnswer('My answer.', basePrompt, undefined, undefined, {
      courseId: 'course-chem',
    });
    const body = sentBody(fetchMock);
    expect(body.__feature).toBe('evaluation');
    expect(body.__courseId).toBe('course-chem');
  });

  it('sends no __courseId when the caller gives no course, even with unlocks on', async () => {
    vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'true');
    fetchMock.mockResolvedValue(proxyOk());
    await realEvaluateAnswer('My answer.', basePrompt);
    expect(sentBody(fetchMock)).not.toHaveProperty('__courseId');
  });
});

describe('the proxy refusing a locked course', () => {
  it('raises CourseLockedError with the course, once, without a retry', async () => {
    fetchMock.mockResolvedValue(
      proxyRefusal(402, {
        error: 'Chemistry needs a one-off unlock.',
        code: 'course_locked',
        courseId: 'course-chem',
        upgradeRequired: true,
      })
    );
    const error = await realEvaluateAnswer('My answer.', basePrompt, undefined, undefined, {
      courseId: 'course-chem',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CourseLockedError);
    expect((error as CourseLockedError).courseId).toBe('course-chem');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('carries the server code for a marking refused with no course (course_required)', async () => {
    vi.stubEnv('VITE_COURSE_UNLOCKS_ENABLED', 'true');
    fetchMock.mockResolvedValue(
      proxyRefusal(400, { error: 'Marking needs the question’s course.', code: 'course_required' })
    );
    const error = await realEvaluateAnswer('My answer.', basePrompt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { code?: string }).code).toBe('course_required');
    expect((error as Error).message).toBe('Marking needs the question’s course.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still reads a 402 without the course code as the daily evaluation limit', async () => {
    fetchMock.mockResolvedValue(
      proxyRefusal(402, {
        error: 'Out of free markings.',
        upgradeRequired: true,
        evaluations: { used: 5, limit: 5 },
      })
    );
    const error = await realEvaluateAnswer('My answer.', basePrompt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EvaluationLimitError);
    expect(error).not.toBeInstanceOf(CourseLockedError);
  });
});

describe('useGemini on a locked course', () => {
  beforeEach(() => {
    override = true;
  });
  const baseProps = () => ({
    showToast: vi.fn(),
    updateCourses: vi.fn(),
    statePath: {} as never,
    currentPrompt: basePrompt,
    currentCourse: { id: 'course-chem', name: 'Chemistry', topics: [], outcomes: [] } as never,
    onApiKeyInvalid: vi.fn(),
    user: { username: 's', role: 'user', preferences: {}, stats: {} } as never,
    onUpdateUser: vi.fn(),
  });

  it('opens the unlock prompt for the course when the server refuses it', async () => {
    const onCourseLocked = vi.fn();
    evaluateSpy.mockRejectedValue(
      new CourseLockedError('Chemistry needs a one-off unlock.', 'course-chem')
    );
    const { result } = renderHook(() => useGemini({ ...baseProps(), onCourseLocked }));
    await act(async () => {
      await result.current.evaluate('My answer.', basePrompt);
    });
    expect(onCourseLocked).toHaveBeenCalledWith('course-chem');
    expect(evaluateSpy).toHaveBeenCalledWith(
      'My answer.',
      basePrompt,
      undefined,
      expect.anything(),
      expect.objectContaining({ courseId: 'course-chem' })
    );
  });

  it('shows the course_required sentence in an error toast', async () => {
    const showToast = vi.fn();
    const onCourseLocked = vi.fn();
    const refused = Object.assign(new Error('Marking needs the question’s course.'), {
      code: 'course_required',
    });
    evaluateSpy.mockRejectedValue(refused);
    const { result } = renderHook(() => useGemini({ ...baseProps(), showToast, onCourseLocked }));
    await act(async () => {
      await result.current.evaluate('My answer.', basePrompt);
    });
    expect(showToast).toHaveBeenCalledWith('Marking needs the question’s course.', 'error');
    expect(onCourseLocked).not.toHaveBeenCalled();
  });

  it('does not open it for an ordinary failure', async () => {
    const onCourseLocked = vi.fn();
    evaluateSpy.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useGemini({ ...baseProps(), onCourseLocked }));
    await act(async () => {
      await result.current.evaluate('My answer.', basePrompt);
    });
    expect(onCourseLocked).not.toHaveBeenCalled();
  });
});
