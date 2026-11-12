import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNavigation } from '../../hooks/useNavigation';
import { Course, DotPoint, StatePath, Topic } from '../../types';

/**
 * Focus areas narrow a dot point, so they belong to it.
 *
 * The selection is restored from storage, and the dot point's wording can
 * change under the reader (new data, another device, the dot point going
 * away). The navigator must not keep briefing the AI on a focus area the
 * syllabus no longer offers, nor count one in the summary.
 */

const stored = vi.hoisted(() => ({ path: undefined as StatePath | undefined }));

vi.mock('../../utils/storageUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/storageUtils')>();
  return {
    ...actual,
    // Each test decides what the path was when the app last closed.
    safeGetItem: (_key: string, fallback: unknown) => stored.path ?? fallback,
    safeSetItem: vi.fn(),
  };
});

const dotPoint = (focusAreas?: string[]): DotPoint => ({
  id: 'dp1',
  description: 'Influences on the global economy',
  prompts: [],
  ...(focusAreas ? { focusAreas } : {}),
});

const courseWith = (dp: DotPoint): Course[] => [
  {
    id: 'c1',
    name: 'Economics',
    outcomes: [],
    topics: [
      {
        id: 't1',
        name: 'Global economy',
        subTopics: [{ id: 'st1', name: 'Influences', dotPoints: [dp] }],
      } as Topic,
    ],
  },
];

const path = (selectedSubItems: string[]): StatePath => ({
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 'st1',
  dotPointId: 'dp1',
  selectedSubItems,
});

beforeEach(() => {
  stored.path = undefined;
});

afterEach(() => vi.clearAllMocks());

describe('focus areas and the dot point they belong to', () => {
  it('keeps only the focus areas the current dot point still offers', () => {
    stored.path = path(['biophysical', 'retired']);
    const { result } = renderHook(() =>
      useNavigation(courseWith(dotPoint(['biophysical', 'economic'])), true)
    );

    expect(result.current.statePath.selectedSubItems).toEqual(['biophysical']);
  });

  it('drops the whole selection when the dot point is no longer there', () => {
    stored.path = path(['biophysical']);
    const { result } = renderHook(() =>
      useNavigation(
        [
          {
            id: 'c1',
            name: 'Economics',
            outcomes: [],
            topics: [
              {
                id: 't1',
                name: 'Global economy',
                subTopics: [{ id: 'st1', name: 'Influences', dotPoints: [] }],
              } as Topic,
            ],
          },
        ],
        true
      )
    );

    expect(result.current.statePath.selectedSubItems).toBeUndefined();
  });

  it('prunes when the focus areas change under the reader', () => {
    stored.path = path(['biophysical', 'economic']);
    const { result, rerender } = renderHook(({ courses }) => useNavigation(courses, true), {
      initialProps: { courses: courseWith(dotPoint(['biophysical', 'economic'])) },
    });
    expect(result.current.statePath.selectedSubItems).toEqual(['biophysical', 'economic']);

    rerender({ courses: courseWith(dotPoint(['economic'])) });

    expect(result.current.statePath.selectedSubItems).toEqual(['economic']);
  });

  it('leaves a valid selection untouched, without writing new state', () => {
    stored.path = path(['biophysical']);
    const { result, rerender } = renderHook(({ courses }) => useNavigation(courses, true), {
      initialProps: { courses: courseWith(dotPoint(['biophysical', 'economic'])) },
    });
    const before = result.current.statePath;

    act(() => {
      rerender({ courses: courseWith(dotPoint(['biophysical', 'economic'])) });
    });

    // Same object back means the validation effect found nothing to change.
    expect(result.current.statePath).toBe(before);
  });
});
