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

describe('what the import reports back', () => {
  it('counts the syllabus points left without a question, from the MERGED course', async () => {
    // The caller cannot work this out: it awaits the import, so the course list
    // it can see is the one from before — and a newly created course is not in
    // it at all, which made the count zero in exactly the case it matters.
    const { props } = harness([]);
    const { result } = renderHook(() => useGemini(props as never));

    let reported: { courseId: string; emptyDotPoints: number } | undefined;
    await act(async () => {
      reported = await result.current.handleStartFullSyllabusImport(
        'HSC Biology',
        [
          {
            name: 'Cells',
            subTopics: [{ name: 'Structure', dotPoints: ['identify a cell', 'describe it'] }],
          },
        ] as never,
        [],
        undefined,
        undefined,
        'year12'
      );
    });

    expect(reported?.courseId).toBeTruthy();
    // Everything an import creates starts without a question.
    expect(reported?.emptyDotPoints).toBe(2);
  });
});

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

/**
 * A NESA focus area names its own year, and that year is what it lands in.
 *
 * The import's year is the default for a node that carries none. Without this, a
 * Year 11 focus area read into a Year 12 import was filed as Year 12, where the
 * student never meets it, and a same-named Year 12 topic absorbed its content.
 */
describe('a topic keeps the year its node names', () => {
  const node = (name: string, year?: 'year11' | 'year12') => ({
    name,
    subTopics: [{ name: 'Sub-topic', dotPoints: ['a dot point'] }],
    ...(year ? { year } : {}),
  });

  it('lands a Year 11 node as Year 11 when the import is Year 12', async () => {
    const { state, props } = harness([]);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Health and Movement Science',
        [node('Health Issues', 'year11')] as never,
        [],
        undefined,
        undefined,
        'year12'
      );
    });

    expect(state.courses[0].topics[0].year).toBe('year11');
  });

  it('lets a Year 12 node stay in Year 12 when the import is Year 11', async () => {
    const { state, props } = harness([]);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Health and Movement Science',
        [node('Movement', 'year12'), node('Health Issues', 'year11')] as never,
        [],
        undefined,
        undefined,
        'year11'
      );
    });

    const [movement, health] = state.courses[0].topics;
    expect('year' in movement).toBe(false);
    expect(health.year).toBe('year11');
  });

  it('uses the import year for a node that names none', async () => {
    const { state, props } = harness([]);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Health and Movement Science',
        [node('Unlabelled')] as never,
        [],
        undefined,
        undefined,
        'year11'
      );
    });

    expect(state.courses[0].topics[0].year).toBe('year11');
  });

  it('does not merge a Year 11 node into a Year 12 topic of the same name', async () => {
    const existing: Course[] = [
      {
        id: 'c1',
        name: 'HSC Health and Movement Science',
        outcomes: [],
        topics: [
          {
            id: 't12',
            name: 'Health Issues',
            subTopics: [{ id: 'st12', name: 'HSC sub-topic', dotPoints: [] }],
          },
        ],
      } as Course,
    ];
    const { state, props } = harness(existing);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Health and Movement Science',
        [node('Health Issues', 'year11')] as never,
        [],
        'c1',
        undefined,
        'year12'
      );
    });

    const topics = state.courses[0].topics;
    expect(topics).toHaveLength(2);
    const hsc = topics.find((t) => t.id === 't12');
    expect(hsc?.subTopics.map((st) => st.name)).toEqual(['HSC sub-topic']);
    const prelim = topics.find((t) => t.id !== 't12');
    expect(prelim?.name).toBe('Health Issues');
    expect(prelim?.year).toBe('year11');
  });

  it('merges a Year 11 node into the Year 11 topic of the same name', async () => {
    const existing: Course[] = [
      {
        id: 'c1',
        name: 'HSC Health and Movement Science',
        outcomes: [],
        topics: [
          {
            id: 't11',
            name: 'Health Issues',
            year: 'year11',
            subTopics: [{ id: 'st11', name: 'Existing sub-topic', dotPoints: [] }],
          },
        ],
      } as Course,
    ];
    const { state, props } = harness(existing);
    const { result } = renderHook(() => useGemini(props as never));

    await act(async () => {
      result.current.handleStartFullSyllabusImport(
        'HSC Health and Movement Science',
        [node('Health Issues', 'year11')] as never,
        [],
        'c1',
        undefined,
        'year12'
      );
    });

    const topics = state.courses[0].topics;
    expect(topics).toHaveLength(1);
    expect(topics[0].id).toBe('t11');
    expect(topics[0].subTopics.map((st) => st.name)).toEqual(['Existing sub-topic', 'Sub-topic']);
  });
});
