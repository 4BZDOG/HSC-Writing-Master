import { describe, it, expect } from 'vitest';
import { deleteSyllabusItem } from '../../utils/stateUtils';
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
