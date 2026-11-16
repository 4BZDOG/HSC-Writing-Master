import { describe, it, expect } from 'vitest';
import { hideDuplicateCourses } from '../../utils/courseDedupe';
import { visibleCourses } from '../../utils/courseVisibility';
import type { Course } from '../../types';

/**
 * One course per name in the navigator: the best copy is kept (shipped, then most
 * questions, then added last), the others are hidden as superseded and kept in
 * the library, and a student's drafts move onto the copy kept.
 */

const course = (
  id: string,
  name: string,
  prompts: Array<{ id: string; userDraft?: string }> = [],
  extra: Partial<Course> = {}
): Course =>
  ({
    id,
    name,
    outcomes: [],
    topics: [
      {
        id: `${id}-t`,
        name: 'Topic',
        subTopics: [
          {
            id: `${id}-st`,
            name: 'Sub-topic',
            dotPoints: [
              {
                id: `${id}-dp`,
                description: 'Dot point',
                prompts: prompts.map((p) => ({ question: p.id, ...p })),
              },
            ],
          },
        ],
      },
    ],
    ...extra,
  }) as unknown as Course;

const draftOf = (c: Course, promptId: string) =>
  c.topics[0].subTopics[0].dotPoints[0].prompts.find((p) => p.id === promptId)?.userDraft;

describe('hiding duplicate courses', () => {
  it('returns the same library when no two courses share a name', () => {
    const library = [course('a', 'Biology'), course('b', 'Chemistry')];
    const result = hideDuplicateCourses(library);
    expect(result.courses).toBe(library);
    expect(result.hidden).toEqual([]);
  });

  it('keeps the shipped copy over one that was not, whatever its size', () => {
    const imported = course('imported', 'HSC Biology', [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
    const shipped = course('course-hsc-biology', 'Biology', [{ id: 'p1' }], { shippedHash: 'h' });
    const { courses, hidden } = hideDuplicateCourses([imported, shipped]);
    expect(visibleCourses(courses, 'user').map((c) => c.id)).toEqual(['course-hsc-biology']);
    expect(courses).toHaveLength(2);
    expect(courses[0].supersededBy).toBe('course-hsc-biology');
    expect(hidden).toEqual([
      { name: 'Biology', keptId: 'course-hsc-biology', hiddenIds: ['imported'] },
    ]);
  });

  it('keeps the copy with more questions when neither or both are shipped', () => {
    const small = course('small', 'Physics', [{ id: 'p1' }]);
    const big = course('big', 'Physics', [{ id: 'p1' }, { id: 'p2' }]);
    const { courses } = hideDuplicateCourses([big, small]);
    expect(visibleCourses(courses, 'user').map((c) => c.id)).toEqual(['big']);
  });

  it('keeps the copy added last when they are otherwise equal', () => {
    const { courses } = hideDuplicateCourses([
      course('old', 'Economics'),
      course('new', 'Economics'),
    ]);
    expect(visibleCourses(courses, 'user').map((c) => c.id)).toEqual(['new']);
  });

  it('carries a draft from the hidden copy onto the kept one, never over its own', () => {
    const hiddenCopy = course('old', 'Legal Studies', [
      { id: 'p1', userDraft: 'From the old copy' },
      { id: 'p2', userDraft: 'Also old' },
    ]);
    const keeper = course('new', 'Legal Studies', [{ id: 'p1' }, { id: 'p2', userDraft: 'Mine' }], {
      shippedHash: 'h',
    });
    const { courses } = hideDuplicateCourses([hiddenCopy, keeper]);
    const kept = courses.find((c) => c.id === 'new')!;
    expect(draftOf(kept, 'p1')).toBe('From the old copy');
    expect(draftOf(kept, 'p2')).toBe('Mine');
    // The hidden copy keeps its own words too, in the Data vault.
    expect(draftOf(courses.find((c) => c.id === 'old')!, 'p1')).toBe('From the old copy');
  });

  it('leaves backups and draft courses alone', () => {
    const library = [
      course('bio', 'Biology', [], { shippedHash: 'h' }),
      course('bio-before-refresh', 'Biology (before refresh)', [], { supersededBy: 'bio' }),
      course('wip', 'Biology', [{ id: 'p1' }, { id: 'p2' }], { status: 'draft' }),
    ];
    expect(hideDuplicateCourses(library).courses).toBe(library);
  });

  it('is idempotent: a second pass hides nothing more', () => {
    const once = hideDuplicateCourses([course('a', 'Geography'), course('b', 'Geography')]).courses;
    const twice = hideDuplicateCourses(once);
    expect(twice.courses).toBe(once);
    expect(twice.hidden).toEqual([]);
  });

  it('hides every extra copy when there are three', () => {
    const { courses, hidden } = hideDuplicateCourses([
      course('a', 'Visual Arts'),
      course('b', 'HSC Visual Arts'),
      course('c', 'visual arts', [{ id: 'p1' }]),
    ]);
    expect(visibleCourses(courses, 'user').map((c) => c.id)).toEqual(['c']);
    expect(hidden[0].hiddenIds).toEqual(['a', 'b']);
  });
});
