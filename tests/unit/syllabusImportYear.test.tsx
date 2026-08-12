import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { produce } from 'immer';
import type { Course } from '../../types';

/**
 * A pasted syllabus lands entirely in one year — its modules AND its outcomes.
 *
 * A NESA syllabus document carries both together. The import tagged the topics
 * with the year on screen and left the outcomes untagged, so a Year 11 paste
 * filed its structure in Year 11 and its outcomes in Year 12 — where they then
 * became the outcomes offered to every HSC question in the course.
 */

vi.mock('../../services/aiCache', () => ({
  AICache: { set: vi.fn(), get: vi.fn(), generateEnrichKey: vi.fn(() => 'k') },
}));
vi.mock('../../services/responseService', () => ({
  persistResponse: vi.fn(),
  saveResponseFeedback: vi.fn(),
}));

import { useGemini } from '../../hooks/useGemini';

const structure = [
  { name: 'Cells as the Basis of Life', subTopics: [{ name: 'Cell Structure', dotPoints: ['x'] }] },
];

/** A live course array the hook can actually mutate, as the app's does. */
const harness = (initial: Course[]) => {
  const state = { courses: initial };
  const props = {
    showToast: vi.fn(),
    updateCourses: (updater: (draft: Course[]) => void) => {
      state.courses = produce(state.courses, updater) as Course[];
    },
    statePath: {},
    currentPrompt: null,
    currentCourse: null,
    onApiKeyInvalid: vi.fn(),
  };
  return { state, props };
};

beforeEach(() => vi.clearAllMocks());

describe('a pasted syllabus keeps its year', () => {
  it('tags a new course’s outcomes with the year its topics went to', async () => {
    const { state, props } = harness([]);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Biology',
        structure as never,
        [{ code: 'BIO11-8', description: 'Prelim outcome' }],
        undefined,
        undefined,
        'year11'
      );
    });

    const course = state.courses[0];
    expect(course.topics[0].year).toBe('year11');
    expect(course.outcomes).toEqual([
      { code: 'BIO11-8', description: 'Prelim outcome', year: 'year11' },
    ]);
  });

  it('leaves a Year 12 paste spelled as the absence of a year', async () => {
    const { state, props } = harness([]);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Biology',
        structure as never,
        [{ code: 'BIO12-12', description: 'HSC outcome' }],
        undefined,
        undefined,
        'year12'
      );
    });

    expect('year' in state.courses[0].outcomes[0]).toBe(false);
    expect('year' in state.courses[0].topics[0]).toBe(false);
  });

  it('respects the year the page itself gave an outcome, over the destination', async () => {
    // A NESA document often carries both years. The year the paste is going to
    // is the fallback, not an override — and Year 12 still comes out as the
    // ABSENCE of a year, because the parser can say 'year12' explicitly and
    // storing that would give one fact two spellings.
    const { state, props } = harness([]);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Biology',
        structure as never,
        [
          { code: 'BIO11-8', description: 'Prelim' },
          { code: 'BIO12-12', description: 'HSC', year: 'year12' },
        ],
        undefined,
        undefined,
        'year11'
      );
    });

    const [prelim, hsc] = state.courses[0].outcomes;
    expect(prelim.year).toBe('year11');
    expect('year' in hsc).toBe(false);
  });

  it('merges Year 11 outcomes into a course that already has HSC ones', async () => {
    const existing: Course[] = [
      {
        id: 'c1',
        name: 'HSC Biology',
        outcomes: [{ code: 'BIO12-12', description: 'HSC outcome' }],
        topics: [],
      } as Course,
    ];
    const { state, props } = harness(existing);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Biology',
        structure as never,
        [{ code: 'BIO11-8', description: 'Prelim outcome' }],
        'c1',
        undefined,
        'year11'
      );
    });

    expect(state.courses[0].outcomes).toEqual([
      { code: 'BIO12-12', description: 'HSC outcome' },
      { code: 'BIO11-8', description: 'Prelim outcome', year: 'year11' },
    ]);
  });
});
