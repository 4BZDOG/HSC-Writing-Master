import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Prompt, PromptVerb, SampleAnswer } from '../../types';

/**
 * A withheld rewrite must not be filed as a sample answer.
 *
 * `evaluate()` saves the model's `revisedAnswer` into the question's exemplar
 * bank. The free tier never receives one — the proxy strips it
 * (`redactPaidFeedback`) because the rewrite IS the `answerUpgrades` feature —
 * and the string form redacts to `''`, which the old `if (result.revisedAnswer)`
 * guard treated as absent.
 *
 * The structured form does not: `{ text: '', keyChanges: [], mark, band }` is a
 * truthy object, so a free student's every marking run would have filed a BLANK
 * exemplar carrying the model's mark and band — and `addAndPruneSampleAnswers`
 * caps the bank, so those blanks would evict real exemplars a teacher had
 * written. The guard now reads the text, not the field.
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

/** The smallest real course tree `findAndUpdateItem` can walk to `target`. */
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

/**
 * Runs one marking call and returns the sample answers `evaluate` filed.
 * `updateCourses` is handed the draft the recipe mutates in place.
 */
const samplesAfterEvaluating = async (revisedAnswer: unknown): Promise<SampleAnswer[]> => {
  const target = { ...prompt, sampleAnswers: [] as SampleAnswer[] };
  const draft = treeAround(target);
  vi.mocked(gemini.evaluateAnswer).mockResolvedValue({
    ...evaluation,
    ...(revisedAnswer === undefined ? {} : { revisedAnswer }),
  } as never);

  const updateCourses = vi.fn((recipe: (d: unknown) => void) => recipe(draft));

  const { result } = renderHook(() =>
    useGemini({
      showToast: vi.fn(),
      updateCourses,
      statePath,
      currentPrompt: prompt,
      currentCourse: null,
      onApiKeyInvalid: vi.fn(),
    } as never)
  );

  await act(async () => {
    await result.current.evaluate('my answer', prompt);
  });

  return target.sampleAnswers;
};

describe('a withheld rewrite is never filed as an exemplar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('files nothing extra when the rewrite was redacted to an empty string', async () => {
    const samples = await samplesAfterEvaluating('');
    expect(samples.some((s) => s.source === 'AI')).toBe(false);
  });

  it('files nothing extra when the rewrite was redacted in its structured form', async () => {
    // The regression: a truthy object with no text.
    const samples = await samplesAfterEvaluating({ text: '', keyChanges: [], mark: 4, band: 3 });
    expect(samples.some((s) => s.source === 'AI')).toBe(false);
    // And nothing blank was filed under any source.
    expect(samples.every((s) => s.answer.trim().length > 0)).toBe(true);
  });

  it('still files a genuine rewrite for a paying user', async () => {
    const samples = await samplesAfterEvaluating({
      text: 'A sustained Band 6 response…',
      keyChanges: ['Named the syllabus term'],
      mark: 4,
      band: 6,
    });
    const ai = samples.find((s) => s.source === 'AI');
    expect(ai?.answer).toContain('Band 6 response');
  });
});
