import { describe, it, expect } from 'vitest';
import { deleteSyllabusItem, clearQuestionsInScope } from '../../utils/stateUtils';
import type { Course, Prompt, StatePath } from '../../types';

/**
 * `deleteSyllabusItem` used to work by `JSON.parse(JSON.stringify(courses))`
 * — a full-tree deep clone on every delete, however deep the target sat — and
 * was rewritten onto Immer's `produce` for structural sharing (ProjectHealth.md
 * PERF-01). These tests pin the exact same behaviour across that rewrite: one
 * case per `type`, the "next selection" logic when the deleted item was the
 * active one, the not-found early-return paths, and — the property the
 * rewrite most needed to preserve — that the input `courses` array is never
 * mutated.
 */

const makeCourse = (): Course =>
  ({
    id: 'course-1',
    name: 'Test Course',
    outcomes: [],
    topics: [
      {
        id: 'topic-1',
        name: 'Topic One',
        subTopics: [
          {
            id: 'subtopic-1',
            name: 'Sub-Topic One',
            dotPoints: [
              {
                id: 'dotpoint-1',
                description: 'Dot point one',
                prompts: [
                  { id: 'prompt-1', question: 'Q1' } as Prompt,
                  { id: 'prompt-2', question: 'Q2' } as Prompt,
                ],
              },
              { id: 'dotpoint-2', description: 'Dot point two', prompts: [] },
            ],
          },
          { id: 'subtopic-2', name: 'Sub-Topic Two', dotPoints: [] },
        ],
      },
      { id: 'topic-2', name: 'Topic Two', subTopics: [] },
    ],
  }) as Course;

describe('deleteSyllabusItem', () => {
  it('deletes a course and never mutates the input array', () => {
    const courses = [makeCourse()];
    const snapshot = JSON.parse(JSON.stringify(courses));
    const path: StatePath = { courseId: 'course-1' };

    const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, 'course', 'course-1');

    expect(updatedCourses).toHaveLength(0);
    expect(newPath).toEqual({ courseId: undefined });
    expect(courses).toEqual(snapshot); // input untouched
    expect(courses).toHaveLength(1);
  });

  it('deletes a topic and advances the path to the next topic', () => {
    const courses = [makeCourse()];
    const path: StatePath = { courseId: 'course-1', topicId: 'topic-1' };

    const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, 'topic', 'topic-1');

    expect(updatedCourses[0].topics.map((t) => t.id)).toEqual(['topic-2']);
    expect(newPath).toEqual({ courseId: 'course-1', topicId: 'topic-2' });
  });

  it('deletes a sub-topic', () => {
    const courses = [makeCourse()];
    const path: StatePath = { courseId: 'course-1', topicId: 'topic-1', subTopicId: 'subtopic-1' };

    const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, 'subTopic', 'subtopic-1');

    const topic = updatedCourses[0].topics.find((t) => t.id === 'topic-1')!;
    expect(topic.subTopics.map((st) => st.id)).toEqual(['subtopic-2']);
    expect(newPath).toEqual({ courseId: 'course-1', topicId: 'topic-1', subTopicId: 'subtopic-2' });
  });

  it('deletes a dot point', () => {
    const courses = [makeCourse()];
    const path: StatePath = {
      courseId: 'course-1',
      topicId: 'topic-1',
      subTopicId: 'subtopic-1',
      dotPointId: 'dotpoint-1',
    };

    const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, 'dotPoint', 'dotpoint-1');

    const subTopic = updatedCourses[0].topics[0].subTopics.find((st) => st.id === 'subtopic-1')!;
    expect(subTopic.dotPoints.map((dp) => dp.id)).toEqual(['dotpoint-2']);
    expect(newPath.dotPointId).toBe('dotpoint-2');
  });

  it('deletes a prompt and picks the next one by clamped index, not just "the next"', () => {
    const courses = [makeCourse()];
    const path: StatePath = {
      courseId: 'course-1',
      topicId: 'topic-1',
      subTopicId: 'subtopic-1',
      dotPointId: 'dotpoint-1',
      promptId: 'prompt-2', // deleting the LAST prompt in the list
    };

    const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, 'prompt', 'prompt-2');

    const prompts = updatedCourses[0].topics[0].subTopics[0].dotPoints[0].prompts;
    expect(prompts.map((p) => p.id)).toEqual(['prompt-1']);
    // Index of the deleted prompt (1) clamped to the new length (1) -> index 0.
    expect(newPath.promptId).toBe('prompt-1');
  });

  it('deleting an item that is not the active selection leaves the path alone', () => {
    const courses = [makeCourse()];
    const path: StatePath = { courseId: 'course-1', topicId: 'topic-2' };

    const { newPath } = deleteSyllabusItem(courses, path, 'topic', 'topic-1');

    expect(newPath).toEqual(path);
  });

  it('is a no-op (but still returns a full path) when the course id in the path does not exist', () => {
    const courses = [makeCourse()];
    const path: StatePath = { courseId: 'nonexistent' };

    const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, 'topic', 'topic-1');

    expect(updatedCourses).toEqual(courses);
    expect(newPath).toEqual(path);
  });
});

/**
 * `clearQuestionsInScope` is the "delete questions, keep structure"
 * counterpart to `deleteSyllabusItem`: it empties `prompts` on every
 * `DotPoint` reachable under a scope node, but never splices out (or
 * otherwise touches the identity/metadata of) any Topic/SubTopic/DotPoint,
 * and never touches `focusAreas`.
 */

const makePrompt = (id: string, question: string): Prompt => ({ id, question }) as Prompt;

const makeScopedCourses = (): Course[] => [
  {
    id: 'course-1',
    name: 'Test Course',
    outcomes: [],
    topics: [
      {
        id: 'topic-1',
        name: 'Topic One',
        subTopics: [
          {
            id: 'subtopic-1',
            name: 'Sub-Topic One',
            dotPoints: [
              {
                id: 'dotpoint-1',
                description: 'Dot point one',
                focusAreas: ['Focus A', 'Focus B'],
                prompts: [makePrompt('prompt-1', 'Q1'), makePrompt('prompt-2', 'Q2')],
              },
              {
                id: 'dotpoint-2',
                description: 'Dot point two',
                focusAreas: [],
                prompts: [makePrompt('prompt-3', 'Q3')],
              },
            ],
          },
          {
            id: 'subtopic-2',
            name: 'Sub-Topic Two',
            dotPoints: [
              {
                id: 'dotpoint-3',
                description: 'Dot point three',
                prompts: [makePrompt('prompt-4', 'Q4')],
              },
            ],
          },
        ],
      },
      {
        id: 'topic-2',
        name: 'Topic Two',
        subTopics: [
          {
            id: 'subtopic-3',
            name: 'Sub-Topic Three',
            dotPoints: [
              {
                id: 'dotpoint-4',
                description: 'Dot point four',
                prompts: [makePrompt('prompt-5', 'Q5')],
              },
            ],
          },
        ],
      },
    ],
  } as Course,
  {
    id: 'course-2',
    name: 'Other Course',
    outcomes: [],
    topics: [
      {
        id: 'topic-9',
        name: 'Untouched Topic',
        subTopics: [
          {
            id: 'subtopic-9',
            name: 'Untouched Sub-Topic',
            dotPoints: [
              {
                id: 'dotpoint-9',
                description: 'Untouched dot point',
                focusAreas: ['Keep me'],
                prompts: [makePrompt('prompt-9', 'Q9')],
              },
            ],
          },
        ],
      },
    ],
  } as Course,
];

describe('clearQuestionsInScope', () => {
  it('type: dotPoint — clears only that dot point, leaves siblings and metadata untouched', () => {
    const courses = makeScopedCourses();
    const snapshot = JSON.parse(JSON.stringify(courses));

    const { updatedCourses, clearedCount } = clearQuestionsInScope(courses, {
      courseId: 'course-1',
      type: 'dotPoint',
      id: 'dotpoint-1',
    });

    expect(clearedCount).toBe(2);

    const dp1 = updatedCourses[0].topics[0].subTopics[0].dotPoints[0];
    expect(dp1.id).toBe('dotpoint-1');
    expect(dp1.description).toBe('Dot point one');
    expect(dp1.focusAreas).toEqual(['Focus A', 'Focus B']);
    expect(dp1.prompts).toEqual([]);

    // Sibling dot point in the same sub-topic is untouched.
    const dp2 = updatedCourses[0].topics[0].subTopics[0].dotPoints[1];
    expect(dp2.prompts).toEqual([makePrompt('prompt-3', 'Q3')]);
    expect(dp2.focusAreas).toEqual([]);

    // Everything else in the tree, and the input array, is untouched.
    expect(updatedCourses[0].topics[0].subTopics[1]).toEqual(snapshot[0].topics[0].subTopics[1]);
    expect(updatedCourses[0].topics[1]).toEqual(snapshot[0].topics[1]);
    expect(updatedCourses[1]).toEqual(snapshot[1]);
    expect(courses).toEqual(snapshot); // input never mutated
  });

  it('type: subTopic — clears every dot point under that sub-topic only', () => {
    const courses = makeScopedCourses();
    const snapshot = JSON.parse(JSON.stringify(courses));

    const { updatedCourses, clearedCount } = clearQuestionsInScope(courses, {
      courseId: 'course-1',
      type: 'subTopic',
      id: 'subtopic-1',
    });

    expect(clearedCount).toBe(3); // 2 prompts in dotpoint-1 + 1 in dotpoint-2

    const subTopic1 = updatedCourses[0].topics[0].subTopics[0];
    expect(subTopic1.id).toBe('subtopic-1');
    expect(subTopic1.name).toBe('Sub-Topic One');
    subTopic1.dotPoints.forEach((dp) => expect(dp.prompts).toEqual([]));
    expect(subTopic1.dotPoints[0].focusAreas).toEqual(['Focus A', 'Focus B']);
    expect(subTopic1.dotPoints[0].id).toBe('dotpoint-1');
    expect(subTopic1.dotPoints[1].id).toBe('dotpoint-2');

    // Sibling sub-topic (different sub-topic, same topic) untouched.
    expect(updatedCourses[0].topics[0].subTopics[1]).toEqual(snapshot[0].topics[0].subTopics[1]);
    // Sibling topic untouched.
    expect(updatedCourses[0].topics[1]).toEqual(snapshot[0].topics[1]);
    // Sibling course untouched.
    expect(updatedCourses[1]).toEqual(snapshot[1]);
    expect(courses).toEqual(snapshot);
  });

  it('type: topic — clears every dot point across all sub-topics of that topic only', () => {
    const courses = makeScopedCourses();
    const snapshot = JSON.parse(JSON.stringify(courses));

    const { updatedCourses, clearedCount } = clearQuestionsInScope(courses, {
      courseId: 'course-1',
      type: 'topic',
      id: 'topic-1',
    });

    expect(clearedCount).toBe(4); // 2 + 1 + 1 across subtopic-1 and subtopic-2

    const topic1 = updatedCourses[0].topics[0];
    expect(topic1.id).toBe('topic-1');
    expect(topic1.name).toBe('Topic One');
    topic1.subTopics.forEach((st) => st.dotPoints.forEach((dp) => expect(dp.prompts).toEqual([])));
    expect(topic1.subTopics[0].dotPoints[0].focusAreas).toEqual(['Focus A', 'Focus B']);
    expect(topic1.subTopics.map((st) => st.id)).toEqual(['subtopic-1', 'subtopic-2']);

    // Sibling topic untouched.
    expect(updatedCourses[0].topics[1]).toEqual(snapshot[0].topics[1]);
    // Sibling course untouched.
    expect(updatedCourses[1]).toEqual(snapshot[1]);
    expect(courses).toEqual(snapshot);
  });

  it('type: course — clears every dot point in every topic of that course only', () => {
    const courses = makeScopedCourses();
    const snapshot = JSON.parse(JSON.stringify(courses));

    const { updatedCourses, clearedCount } = clearQuestionsInScope(courses, {
      courseId: 'course-1',
      type: 'course',
      id: 'course-1',
    });

    expect(clearedCount).toBe(5); // every prompt in course-1

    const course1 = updatedCourses[0];
    expect(course1.id).toBe('course-1');
    expect(course1.name).toBe('Test Course');
    course1.topics.forEach((t) =>
      t.subTopics.forEach((st) => st.dotPoints.forEach((dp) => expect(dp.prompts).toEqual([])))
    );
    expect(course1.topics[0].subTopics[0].dotPoints[0].focusAreas).toEqual(['Focus A', 'Focus B']);
    expect(course1.topics.map((t) => t.id)).toEqual(['topic-1', 'topic-2']);

    // A different course entirely is untouched.
    expect(updatedCourses[1]).toEqual(snapshot[1]);
    expect(courses).toEqual(snapshot);
  });

  it('no-ops safely on an unknown id, returning the original courses reference and clearedCount 0', () => {
    const courses = makeScopedCourses();

    const { updatedCourses, clearedCount } = clearQuestionsInScope(courses, {
      courseId: 'course-1',
      type: 'dotPoint',
      id: 'nonexistent-dotpoint',
    });

    expect(clearedCount).toBe(0);
    expect(updatedCourses).toBe(courses); // same reference, not just equal
  });

  it('no-ops safely on an unknown courseId', () => {
    const courses = makeScopedCourses();

    const { updatedCourses, clearedCount } = clearQuestionsInScope(courses, {
      courseId: 'nonexistent-course',
      type: 'course',
      id: 'nonexistent-course',
    });

    expect(clearedCount).toBe(0);
    expect(updatedCourses).toBe(courses);
  });
});
