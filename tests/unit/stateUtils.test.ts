import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findAndUpdateItem, deleteSyllabusItem } from '../../utils/stateUtils';
import { Course, StatePath } from '../../types';

/**
 * Builds a fresh, deterministic course tree for each test so mutations in one
 * test never leak into another. Shape mirrors the real Course hierarchy:
 * Course > Topic > SubTopic > DotPoint > Prompt.
 */
const buildCourses = (): Course[] => [
  {
    id: 'c1',
    name: 'Course 1',
    outcomes: [{ code: 'O1', description: 'Outcome 1' }],
    topics: [
      {
        id: 't1',
        name: 'Topic 1',
        subTopics: [
          {
            id: 'st1',
            name: 'SubTopic 1',
            dotPoints: [
              {
                id: 'dp1',
                description: 'Dot Point 1',
                prompts: [
                  { id: 'p1', question: 'Q1', totalMarks: 5, verb: 'EXPLAIN' },
                  { id: 'p2', question: 'Q2', totalMarks: 3, verb: 'DESCRIBE' },
                ],
              },
              { id: 'dp2', description: 'Dot Point 2', prompts: [] },
            ],
          },
          { id: 'st2', name: 'SubTopic 2', dotPoints: [] },
        ],
      },
      { id: 't2', name: 'Topic 2', subTopics: [] },
    ],
  },
  {
    id: 'c2',
    name: 'Course 2',
    outcomes: [],
    topics: [],
  },
];

const fullPath: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 'st1',
  dotPointId: 'dp1',
  promptId: 'p1',
};

describe('stateUtils', () => {
  describe('findAndUpdateItem', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let debugSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
      debugSpy.mockRestore();
    });

    it('updates the course when only courseId is provided', () => {
      const courses = buildCourses();
      const result = findAndUpdateItem(courses, { courseId: 'c1' }, (course) => {
        course.name = 'Renamed Course';
      });

      expect(result).toBe(true);
      expect(courses[0].name).toBe('Renamed Course');
    });

    it('updates a nested prompt at the deepest path', () => {
      const courses = buildCourses();
      const result = findAndUpdateItem(courses, fullPath, (prompt) => {
        prompt.question = 'Updated question';
      });

      expect(result).toBe(true);
      expect(courses[0].topics[0].subTopics[0].dotPoints[0].prompts[0].question).toBe(
        'Updated question'
      );
    });

    it('updates intermediate levels (topic, subTopic, dotPoint)', () => {
      const courses = buildCourses();
      expect(
        findAndUpdateItem(courses, { courseId: 'c1', topicId: 't1' }, (t) => {
          t.name = 'T';
        })
      ).toBe(true);
      expect(
        findAndUpdateItem(courses, { courseId: 'c1', topicId: 't1', subTopicId: 'st1' }, (st) => {
          st.name = 'ST';
        })
      ).toBe(true);
      expect(
        findAndUpdateItem(
          courses,
          { courseId: 'c1', topicId: 't1', subTopicId: 'st1', dotPointId: 'dp1' },
          (dp) => {
            dp.description = 'DP';
          }
        )
      ).toBe(true);

      expect(courses[0].topics[0].name).toBe('T');
      expect(courses[0].topics[0].subTopics[0].name).toBe('ST');
      expect(courses[0].topics[0].subTopics[0].dotPoints[0].description).toBe('DP');
    });

    it('returns false and does not invoke the updater when courseId is missing', () => {
      const courses = buildCourses();
      const updater = vi.fn();
      const result = findAndUpdateItem(courses, {}, updater);

      expect(result).toBe(false);
      expect(updater).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it.each([
      ['course', { courseId: 'missing' }],
      ['topic', { courseId: 'c1', topicId: 'missing' }],
      ['subTopic', { courseId: 'c1', topicId: 't1', subTopicId: 'missing' }],
      ['dotPoint', { courseId: 'c1', topicId: 't1', subTopicId: 'st1', dotPointId: 'missing' }],
      [
        'prompt',
        {
          courseId: 'c1',
          topicId: 't1',
          subTopicId: 'st1',
          dotPointId: 'dp1',
          promptId: 'missing',
        },
      ],
    ])('returns false when %s in the path is not found', (_label, path) => {
      const courses = buildCourses();
      const updater = vi.fn();
      const result = findAndUpdateItem(courses, path as Partial<StatePath>, updater);

      expect(result).toBe(false);
      expect(updater).not.toHaveBeenCalled();
    });
  });

  describe('deleteSyllabusItem', () => {
    it('does not mutate the original courses array (immutability)', () => {
      const courses = buildCourses();
      const snapshot = JSON.parse(JSON.stringify(courses));

      deleteSyllabusItem(courses, fullPath, 'prompt', 'p1');

      expect(courses).toEqual(snapshot);
    });

    it('deletes a course and selects the next course', () => {
      const courses = buildCourses();
      const { updatedCourses, newPath } = deleteSyllabusItem(
        courses,
        { courseId: 'c1' },
        'course',
        'c1'
      );

      expect(updatedCourses.map((c) => c.id)).toEqual(['c2']);
      expect(newPath.courseId).toBe('c2');
    });

    it('selects undefined when the last course is deleted', () => {
      const courses = [buildCourses()[0]];
      const { updatedCourses, newPath } = deleteSyllabusItem(
        courses,
        { courseId: 'c1' },
        'course',
        'c1'
      );

      expect(updatedCourses).toEqual([]);
      expect(newPath.courseId).toBeUndefined();
    });

    it('deletes a topic and selects the next sibling topic', () => {
      const courses = buildCourses();
      const { updatedCourses, newPath } = deleteSyllabusItem(
        courses,
        { courseId: 'c1', topicId: 't1' },
        'topic',
        't1'
      );

      expect(updatedCourses[0].topics.map((t) => t.id)).toEqual(['t2']);
      expect(newPath.topicId).toBe('t2');
    });

    it('deletes a subTopic', () => {
      const courses = buildCourses();
      const { updatedCourses, newPath } = deleteSyllabusItem(
        courses,
        { courseId: 'c1', topicId: 't1', subTopicId: 'st1' },
        'subTopic',
        'st1'
      );

      expect(updatedCourses[0].topics[0].subTopics.map((st) => st.id)).toEqual(['st2']);
      expect(newPath.subTopicId).toBe('st2');
    });

    it('deletes a dotPoint', () => {
      const courses = buildCourses();
      const { updatedCourses, newPath } = deleteSyllabusItem(
        courses,
        { courseId: 'c1', topicId: 't1', subTopicId: 'st1', dotPointId: 'dp1' },
        'dotPoint',
        'dp1'
      );

      expect(updatedCourses[0].topics[0].subTopics[0].dotPoints.map((dp) => dp.id)).toEqual([
        'dp2',
      ]);
      expect(newPath.dotPointId).toBe('dp2');
    });

    it('deletes a prompt and selects the next sibling prompt', () => {
      const courses = buildCourses();
      const { updatedCourses, newPath } = deleteSyllabusItem(courses, fullPath, 'prompt', 'p1');

      const prompts = updatedCourses[0].topics[0].subTopics[0].dotPoints[0].prompts;
      expect(prompts.map((p) => p.id)).toEqual(['p2']);
      // Deleted index 0; next selection clamps to remaining list -> 'p2'.
      expect(newPath.promptId).toBe('p2');
    });

    it('leaves siblings intact when deleting one prompt', () => {
      const courses = buildCourses();
      const { updatedCourses } = deleteSyllabusItem(courses, fullPath, 'prompt', 'p2');

      const prompts = updatedCourses[0].topics[0].subTopics[0].dotPoints[0].prompts;
      expect(prompts.map((p) => p.id)).toEqual(['p1']);
      expect(prompts[0].question).toBe('Q1');
    });

    it('is a no-op when the id to delete does not exist', () => {
      const courses = buildCourses();
      const { updatedCourses, newPath } = deleteSyllabusItem(
        courses,
        fullPath,
        'prompt',
        'nonexistent'
      );

      const prompts = updatedCourses[0].topics[0].subTopics[0].dotPoints[0].prompts;
      expect(prompts.map((p) => p.id)).toEqual(['p1', 'p2']);
      expect(newPath.promptId).toBe('p1');
    });

    it('returns the path unchanged when the parent course is missing', () => {
      const courses = buildCourses();
      const path: StatePath = { courseId: 'missing', topicId: 't1' };
      const { newPath } = deleteSyllabusItem(courses, path, 'topic', 't1');

      expect(newPath).toEqual(path);
    });
  });
});
