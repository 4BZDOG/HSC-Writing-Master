import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNavigation } from '../../hooks/useNavigation';
import { Course, Prompt, PromptVerb, SyllabusYear, Topic } from '../../types';

/**
 * One selection, one answer.
 *
 * The navigator filters topics by year; `useNavigation` resolves the same path
 * into the objects the workspace, the breadcrumb and the PDF export all read.
 * If the two disagree — the picker showing Year 11 with nothing selected while
 * the workspace still displays a Year 12 question — the app is telling a
 * student two different things about where they are.
 */

vi.mock('../../utils/storageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storageUtils')>();
  return {
    ...actual,
    // The hook restores its path from localStorage on mount; each test supplies
    // its own starting point instead.
    safeGetItem: (_key: string, fallback: unknown) => fallback,
    safeSetItem: vi.fn(),
  };
});

const prompt = (id: string): Prompt =>
  ({ id, question: 'Explain it.', verb: 'EXPLAIN' as PromptVerb, totalMarks: 5 }) as Prompt;

const topic = (id: string, name: string, year?: SyllabusYear): Topic =>
  ({
    id,
    name,
    ...(year ? { year } : {}),
    subTopics: [
      {
        id: `st-${id}`,
        name: 'Sub',
        dotPoints: [{ id: `dp-${id}`, description: 'A dot point', prompts: [prompt(`p-${id}`)] }],
      },
    ],
  }) as Topic;

const courses: Course[] = [
  {
    id: 'c1',
    name: 'HSC Biology',
    outcomes: [],
    topics: [topic('t11', 'Cells', 'year11'), topic('t12', 'Heredity')],
  },
];

beforeEach(() => localStorage.clear());
afterEach(() => vi.clearAllMocks());

describe('the path and the year', () => {
  it('resolves a Year 12 topic while the year is Year 12', async () => {
    const { result } = renderHook(() => useNavigation(courses, true));

    act(() => {
      result.current.handlePathChange({ courseId: 'c1', topicId: 't12', promptId: 'p-t12' });
    });

    await waitFor(() => expect(result.current.currentTopic?.id).toBe('t12'));
  });

  it('treats a topic from the other year as gone', async () => {
    const { result } = renderHook(() => useNavigation(courses, true));

    act(() => {
      result.current.handlePathChange({
        courseId: 'c1',
        syllabusYear: 'year11',
        // Left over from before the year changed — the navigator would not
        // offer this topic, and neither may the workspace.
        topicId: 't12',
      });
    });

    // Nothing downstream can resolve it, which is the invariant that matters:
    // the workspace, the breadcrumb and the PDF export all read these objects.
    await waitFor(() => expect(result.current.currentTopic).toBeUndefined());
    await waitFor(() => expect(result.current.currentPrompt).toBeUndefined());
    // The id itself is left in the path until the data changes — the picker
    // clears it at the point of the year change, and a reload re-validates. It
    // is inert either way, because nothing resolves it.
  });

  it('resolves a Year 11 topic once the year says Year 11', async () => {
    const { result } = renderHook(() => useNavigation(courses, true));

    act(() => {
      result.current.handlePathChange({
        courseId: 'c1',
        syllabusYear: 'year11',
        topicId: 't11',
      });
    });

    await waitFor(() => expect(result.current.currentTopic?.id).toBe('t11'));
  });

  it('falls back to the year that has content, rather than showing nothing', async () => {
    const hscOnly: Course[] = [
      { id: 'c1', name: 'HSC Biology', outcomes: [], topics: [topic('t12', 'Heredity')] },
    ];
    const { result } = renderHook(() => useNavigation(hscOnly, true));

    act(() => {
      // A year carried over from a course that had Year 11 content.
      result.current.handlePathChange({ courseId: 'c1', syllabusYear: 'year11', topicId: 't12' });
    });

    // The Year 12 topic stays resolvable because Year 12 is where this course
    // actually is.
    await waitFor(() => expect(result.current.currentTopic?.id).toBe('t12'));
  });
});
